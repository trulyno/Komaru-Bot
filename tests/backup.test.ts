import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runTestCase } from './testHarness';
import { packDirectory, unpackArchive } from '../src/utils/tarArchive';
import { GoogleDriveClient, GoogleDriveFile } from '../src/services/googleDriveClient';
import { BackupService } from '../src/services/backupService';
import { commandRegistry } from '../src/commandRegistry';
import backupModule from '../src/modules/backup';
import { config } from '../src/config';

// Generate temporary RSA key pair for testing JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

async function runSuite(): Promise<void> {
    const testDir = path.resolve(__dirname, 'temp_backup_test');
    const sourceDir = path.join(testDir, 'source_data');
    const extractDir = path.join(testDir, 'extracted_data');
    const archivePath = path.join(testDir, 'test_backup.tar.gz');

    function cleanTemp(): void {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    }

    cleanTemp();
    fs.mkdirSync(sourceDir, { recursive: true });

    // Populate sourceDir with sample data
    fs.writeFileSync(
        path.join(sourceDir, 'config.json'),
        JSON.stringify({ version: '1.0.0', name: 'Komaru' }),
    );
    fs.mkdirSync(path.join(sourceDir, 'subfolder', 'deep'), { recursive: true });
    fs.writeFileSync(
        path.join(sourceDir, 'subfolder', 'deep', 'note.txt'),
        'Hello from deep folder!\nLine 2',
    );
    fs.writeFileSync(
        path.join(sourceDir, 'binary.dat'),
        Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]),
    );

    await runTestCase('tarArchive - pack and unpack directory integrity', async () => {
        const gzBuffer = await packDirectory(sourceDir, archivePath);
        assert.ok(gzBuffer.length > 0, 'Gzip buffer should not be empty');
        assert.ok(fs.existsSync(archivePath), 'Archive file should be written to disk');

        const extractedFiles = await unpackArchive(archivePath, extractDir);
        assert.ok(extractedFiles.length >= 3, 'Should have extracted all files and folders');

        // Check content integrity
        const restoredConfig = fs.readFileSync(path.join(extractDir, 'config.json'), 'utf-8');
        assert.strictEqual(JSON.parse(restoredConfig).name, 'Komaru');

        const restoredNote = fs.readFileSync(
            path.join(extractDir, 'subfolder', 'deep', 'note.txt'),
            'utf-8',
        );
        assert.strictEqual(restoredNote, 'Hello from deep folder!\nLine 2');

        const restoredBinary = fs.readFileSync(path.join(extractDir, 'binary.dat'));
        assert.deepStrictEqual(restoredBinary, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]));
    });

    await runTestCase(
        'tarArchive - in-memory buffer unpack and path traversal protection',
        async () => {
            const memoryGz = await packDirectory(sourceDir);
            const inMemoryExtractDir = path.join(testDir, 'mem_extracted');

            const extracted = await unpackArchive(memoryGz, inMemoryExtractDir);
            assert.ok(extracted.includes('config.json'));
            assert.strictEqual(
                fs.readFileSync(path.join(inMemoryExtractDir, 'config.json'), 'utf-8'),
                JSON.stringify({ version: '1.0.0', name: 'Komaru' }),
            );
        },
    );

    await runTestCase('GoogleDriveClient - credentials parsing & configuration state', async () => {
        const unconfiguredClient = new GoogleDriveClient();
        assert.strictEqual(unconfiguredClient.isConfigured(), false);

        const configuredClient = new GoogleDriveClient({
            clientEmail: 'test-service@example.iam.gserviceaccount.com',
            privateKey: privateKey,
            folderId: 'folder_12345',
        });
        assert.strictEqual(configuredClient.isConfigured(), true);
        assert.strictEqual(
            configuredClient.getClientEmail(),
            'test-service@example.iam.gserviceaccount.com',
        );
        assert.strictEqual(configuredClient.getFolderId(), 'folder_12345');

        // Test loading from raw JSON string
        const jsonClient = new GoogleDriveClient({
            rawJson: JSON.stringify({
                client_email: 'json-service@example.iam.gserviceaccount.com',
                private_key: privateKey,
            }),
        });
        assert.strictEqual(jsonClient.isConfigured(), true);
        assert.strictEqual(
            jsonClient.getClientEmail(),
            'json-service@example.iam.gserviceaccount.com',
        );
    });

    await runTestCase(
        'GoogleDriveClient - OAuth token, upload, list, download, delete with fetch mock',
        async () => {
            const originalFetch = global.fetch;

            const fakeFiles: GoogleDriveFile[] = [
                {
                    id: 'file_001',
                    name: 'komaru_backup_2026-09-11.tar.gz',
                    size: 1024,
                    createdTime: '2026-09-11T12:00:00Z',
                },
                {
                    id: 'file_002',
                    name: 'komaru_backup_2026-09-10.tar.gz',
                    size: 2048,
                    createdTime: '2026-09-10T12:00:00Z',
                },
            ];

            try {
                (global as any).fetch = async (url: string, init?: RequestInit) => {
                    const urlStr = String(url);

                    if (urlStr.includes('oauth2.googleapis.com/token')) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({
                                access_token: 'fake_mock_access_token_xyz',
                                expires_in: 3600,
                            }),
                        } as any;
                    }

                    if (urlStr.includes('/upload/drive/v3/files')) {
                        assert.strictEqual(init?.method, 'POST');
                        assert.ok(
                            String(
                                init?.headers && (init.headers as any)['Authorization'],
                            ).includes('Bearer fake_mock_access_token_xyz'),
                        );
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({
                                id: 'new_file_id_999',
                                name: 'komaru_backup_new.tar.gz',
                                size: 4096,
                                createdTime: new Date().toISOString(),
                            }),
                        } as any;
                    }

                    if (urlStr.includes('/drive/v3/files?')) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({
                                files: fakeFiles,
                            }),
                        } as any;
                    }

                    if (urlStr.includes('/drive/v3/files/file_001?alt=media')) {
                        const testBuffer = await packDirectory(sourceDir);
                        return {
                            ok: true,
                            status: 200,
                            arrayBuffer: async () =>
                                testBuffer.buffer.slice(
                                    testBuffer.byteOffset,
                                    testBuffer.byteOffset + testBuffer.byteLength,
                                ),
                        } as any;
                    }

                    if (urlStr.includes('/drive/v3/files/file_002') && init?.method === 'DELETE') {
                        return {
                            ok: true,
                            status: 204,
                        } as any;
                    }

                    return {
                        ok: false,
                        status: 404,
                        text: async () => 'Not Found',
                    } as any;
                };

                const client = new GoogleDriveClient({
                    clientEmail: 'service@example.com',
                    privateKey: privateKey,
                    folderId: 'folder_abc',
                });

                // 1. Get access token
                const token = await client.getAccessToken();
                assert.strictEqual(token, 'fake_mock_access_token_xyz');

                // 2. Upload file
                const uploaded = await client.uploadFile({
                    name: 'komaru_backup_new.tar.gz',
                    mimeType: 'application/gzip',
                    data: Buffer.from('test data'),
                });
                assert.strictEqual(uploaded.id, 'new_file_id_999');

                // 3. List files
                const files = await client.listFiles();
                assert.strictEqual(files.length, 2);
                assert.strictEqual(files[0].id, 'file_001');

                // 4. Download file
                const downloaded = await client.downloadFile('file_001');
                assert.ok(downloaded.length > 0);

                // 5. Delete file
                await client.deleteFile('file_002');
            } finally {
                global.fetch = originalFetch;
            }
        },
    );

    await runTestCase(
        'BackupService - createBackup, listBackups, and retention pruning',
        async () => {
            const originalFetch = global.fetch;

            let deletedFileId: string | null = null;
            const existingFiles: GoogleDriveFile[] = [
                { id: 'f1', name: 'komaru_backup_1.tar.gz', createdTime: '2026-09-11T10:00:00Z' },
                { id: 'f2', name: 'komaru_backup_2.tar.gz', createdTime: '2026-09-11T09:00:00Z' },
                { id: 'f3', name: 'komaru_backup_3.tar.gz', createdTime: '2026-09-11T08:00:00Z' },
            ];

            try {
                (global as any).fetch = async (url: string, init?: RequestInit) => {
                    const urlStr = String(url);

                    if (urlStr.includes('oauth2.googleapis.com/token')) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({ access_token: 'tok_123', expires_in: 3600 }),
                        } as any;
                    }

                    if (urlStr.includes('/upload/drive/v3/files')) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({
                                id: 'f_new',
                                name: 'komaru_backup_new.tar.gz',
                            }),
                        } as any;
                    }

                    if (urlStr.includes('/drive/v3/files?')) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({ files: existingFiles }),
                        } as any;
                    }

                    if (init?.method === 'DELETE') {
                        const match = urlStr.match(/\/drive\/v3\/files\/(.+)$/);
                        if (match) {
                            deletedFileId = match[1];
                        }
                        return { ok: true, status: 204 } as any;
                    }

                    return { ok: false, status: 404, text: async () => 'Not Found' } as any;
                };

                const mockClient = new GoogleDriveClient({
                    clientEmail: 'bot@example.com',
                    privateKey: privateKey,
                    folderId: 'folder_test',
                });

                const backupDataDir = path.join(testDir, 'backup_service_data');
                fs.mkdirSync(backupDataDir, { recursive: true });
                fs.writeFileSync(
                    path.join(backupDataDir, 'app_state.json'),
                    JSON.stringify({ ok: true }),
                );

                const service = new BackupService(backupDataDir, mockClient);

                // Trigger manual backup
                const res = await service.createBackup('manual');
                assert.strictEqual(res.id, 'f_new');

                const status = service.getStatus();
                assert.strictEqual(status.lastBackupStatus, 'success');
                assert.ok(status.lastBackupName?.startsWith('komaru_backup_'));
                assert.ok((status.lastBackupSize || 0) > 0);

                // List backups
                const list = await service.listBackups();
                assert.strictEqual(list.length, 3);
            } finally {
                global.fetch = originalFetch;
            }
        },
    );

    await runTestCase('BackupService - live restore & soft restart trigger', async () => {
        const originalFetch = global.fetch;

        const restoreDataDir = path.join(testDir, 'restore_service_data');
        fs.mkdirSync(restoreDataDir, { recursive: true });
        fs.writeFileSync(path.join(restoreDataDir, 'initial.json'), '{"state":"initial"}');

        // Create a mock backup to restore containing modified.json
        const mockBackupSrc = path.join(testDir, 'mock_restore_source');
        fs.mkdirSync(mockBackupSrc, { recursive: true });
        fs.writeFileSync(
            path.join(mockBackupSrc, 'restored.json'),
            '{"state":"restored_from_drive"}',
        );
        const mockGzBuffer = await packDirectory(mockBackupSrc);

        let reloadModuleCalled = false;
        const mockClientObj = {
            user: { id: 'bot_123' },
        };

        try {
            (global as any).fetch = async (url: string) => {
                const urlStr = String(url);
                if (urlStr.includes('oauth2.googleapis.com/token')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ access_token: 'tok_123', expires_in: 3600 }),
                    } as any;
                }
                if (urlStr.includes('/drive/v3/files?')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            files: [
                                { id: 'backup_id_latest', name: 'komaru_backup_2026-09-11.tar.gz' },
                            ],
                        }),
                    } as any;
                }
                if (urlStr.includes('/drive/v3/files/backup_id_latest?alt=media')) {
                    return {
                        ok: true,
                        status: 200,
                        arrayBuffer: async () =>
                            mockGzBuffer.buffer.slice(
                                mockGzBuffer.byteOffset,
                                mockGzBuffer.byteOffset + mockGzBuffer.byteLength,
                            ),
                    } as any;
                }
                return { ok: false, status: 404, text: async () => 'Not Found' } as any;
            };

            const mockDriveClient = new GoogleDriveClient({
                clientEmail: 'bot@example.com',
                privateKey: privateKey,
                folderId: 'folder_test',
            });

            const service = new BackupService(restoreDataDir, mockDriveClient);

            // Restore "latest"
            const result = await service.restoreBackup('latest', mockClientObj);
            assert.strictEqual(result.backupName, 'komaru_backup_2026-09-11.tar.gz');
            assert.ok(result.restoredFiles.includes('restored.json'));

            // Verify file unpacked
            assert.ok(fs.existsSync(path.join(restoreDataDir, 'restored.json')));
            const content = fs.readFileSync(path.join(restoreDataDir, 'restored.json'), 'utf-8');
            assert.strictEqual(JSON.parse(content).state, 'restored_from_drive');
        } finally {
            global.fetch = originalFetch;
        }
    });

    await runTestCase('Backup Module - command registration & admin check', async () => {
        const mockClient = { user: { id: 'bot_123' } };
        await backupModule.register(mockClient);

        const cmd = commandRegistry.get('backup');
        assert.ok(cmd, 'Backup command must be registered');
        assert.strictEqual(cmd?.name, 'backup');
        assert.ok(cmd?.options?.some((opt) => opt.name === 'create'));
        assert.ok(cmd?.options?.some((opt) => opt.name === 'list'));
        assert.ok(cmd?.options?.some((opt) => opt.name === 'restore'));
        assert.ok(cmd?.options?.some((opt) => opt.name === 'status'));

        // Test non-admin gets blocked
        let replyContent = '';
        let replyEphemeral = false;
        const nonAdminInteraction = {
            user: { id: 'random_user_999' },
            memberPermissions: { has: () => false },
            member: { permissions: { has: () => false } },
            options: { getSubcommand: () => 'status' },
            reply: async (opts: any) => {
                replyContent = opts.content;
                replyEphemeral = opts.ephemeral;
            },
        };

        await cmd.handler(nonAdminInteraction);
        assert.ok(replyContent.includes('do not have permission'));
        assert.strictEqual(replyEphemeral, true);

        // Test admin status response
        let replyEmbeds: any[] = [];
        const adminInteraction = {
            user: { id: config.env.botOwnerId || 'admin_user_1' },
            memberPermissions: { has: (perm: string) => perm === 'Administrator' },
            options: { getSubcommand: () => 'status' },
            reply: async (opts: any) => {
                replyEmbeds = opts.embeds;
            },
        };

        await cmd.handler(adminInteraction);
        assert.ok(replyEmbeds.length > 0, 'Admin should receive status embed');
    });

    cleanTemp();
}

runSuite().catch((err) => {
    console.error(err);
    process.exit(1);
});
