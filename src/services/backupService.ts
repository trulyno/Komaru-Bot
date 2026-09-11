import path from 'node:path';
import { config } from '../config';
import { logger, logError } from '../logger';
import { moduleLoader } from '../moduleLoader';
import { GoogleDriveClient, GoogleDriveFile } from './googleDriveClient';
import { packDirectory, unpackArchive } from '../utils/tarArchive';

export interface BackupStatus {
    isConfigured: boolean;
    schedulerActive: boolean;
    intervalMinutes: number;
    retentionCount: number;
    targetFolderId?: string;
    clientEmail?: string;
    isBackingUp: boolean;
    lastBackupTime?: string;
    lastBackupName?: string;
    lastBackupSize?: number;
    lastBackupStatus?: 'success' | 'failed';
    lastBackupError?: string;
    nextBackupTime?: string;
}

export class BackupService {
    private driveClient: GoogleDriveClient;
    private timerHandle?: NodeJS.Timeout;
    private isBackingUp = false;
    private dataDirectory: string;
    private hasCustomClient: boolean;

    private lastBackupTime?: string;
    private lastBackupName?: string;
    private lastBackupSize?: number;
    private lastBackupStatus?: 'success' | 'failed';
    private lastBackupError?: string;
    private nextBackupTimestamp?: number;

    constructor(customDataDir?: string, customClient?: GoogleDriveClient) {
        this.dataDirectory = customDataDir ?? path.resolve(process.cwd(), 'data');
        this.hasCustomClient = Boolean(customClient);
        this.driveClient = customClient ?? new GoogleDriveClient();
        if (!this.hasCustomClient) {
            this.reloadConfig();
        }
    }

    /**
     * Updates Google Drive credentials and configurations from config singleton.
     */
    public reloadConfig(): void {
        if (this.hasCustomClient) {
            return;
        }
        const env = config.env;
        this.driveClient.loadCredentials({
            clientEmail: env.googleServiceAccountEmail,
            privateKey: env.googlePrivateKey,
            keyFilePath: env.googleServiceAccountKeyPath,
            rawJson: env.googleServiceAccountJson,
            folderId: env.googleDriveFolderId,
        });
    }

    /**
     * Starts the periodic backup scheduler.
     */
    public startScheduler(_client?: any): void {
        this.stopScheduler();

        if (!config.env.backupEnabled) {
            logger.info('Scheduled backups are disabled via BACKUP_ENABLED=false.');
            return;
        }

        if (!this.driveClient.isConfigured()) {
            logger.warn(
                'Google Drive backup credentials not configured. Automated backups disabled.',
            );
            return;
        }

        const intervalMs = config.env.backupIntervalMinutes * 60 * 1000;
        this.nextBackupTimestamp = Date.now() + intervalMs;

        logger.info(
            `Starting backup scheduler. Backups every ${config.env.backupIntervalMinutes} minutes.`,
        );

        this.timerHandle = setInterval(() => {
            this.nextBackupTimestamp = Date.now() + intervalMs;
            this.createBackup('scheduled').catch((err) => {
                logError(err, 'Scheduled backup execution failed');
            });
        }, intervalMs);
    }

    /**
     * Stops the periodic backup scheduler.
     */
    public stopScheduler(): void {
        if (this.timerHandle) {
            clearInterval(this.timerHandle);
            this.timerHandle = undefined;
            this.nextBackupTimestamp = undefined;
        }
    }

    /**
     * Creates and uploads a full backup of the data directory to Google Drive.
     * Non-blocking and concurrency-guarded.
     */
    public async createBackup(
        triggerSource: 'scheduled' | 'manual' = 'manual',
    ): Promise<GoogleDriveFile> {
        if (this.isBackingUp) {
            throw new Error('A backup operation is already currently in progress.');
        }

        this.reloadConfig();
        if (!this.driveClient.isConfigured()) {
            throw new Error(
                'Google Drive credentials are not configured. Please set service account credentials.',
            );
        }

        this.isBackingUp = true;
        const startTime = Date.now();

        try {
            logger.info(`Starting ${triggerSource} data backup...`);

            // Generate backup archive name with ISO timestamp
            const now = new Date();
            const dateStr = now.toISOString().replace(/[:.]/g, '-');
            const archiveName = `komaru_backup_${dateStr}.tar.gz`;

            // Pack data directory into tar.gz Buffer
            const gzBuffer = await packDirectory(this.dataDirectory);

            // Upload to Google Drive
            const uploadedFile = await this.driveClient.uploadFile({
                name: archiveName,
                mimeType: 'application/gzip',
                data: gzBuffer,
                folderId: config.env.googleDriveFolderId,
            });

            const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info(
                `Successfully created backup "${archiveName}" (${gzBuffer.length} bytes) in ${durationSec}s. File ID: ${uploadedFile.id}`,
            );

            this.lastBackupTime = new Date().toISOString();
            this.lastBackupName = archiveName;
            this.lastBackupSize = gzBuffer.length;
            this.lastBackupStatus = 'success';
            this.lastBackupError = undefined;

            // Prune older backups according to retention policy
            await this.pruneOldBackups();

            return uploadedFile;
        } catch (error: any) {
            this.lastBackupTime = new Date().toISOString();
            this.lastBackupStatus = 'failed';
            this.lastBackupError = error?.message || String(error);
            logError(error, `Backup creation failed (${triggerSource})`);
            throw error;
        } finally {
            this.isBackingUp = false;
        }
    }

    /**
     * Lists available backups from Google Drive.
     */
    public async listBackups(): Promise<GoogleDriveFile[]> {
        this.reloadConfig();
        if (!this.driveClient.isConfigured()) {
            throw new Error('Google Drive credentials are not configured.');
        }

        return await this.driveClient.listFiles({
            folderId: config.env.googleDriveFolderId,
            prefix: 'komaru_backup_',
        });
    }

    /**
     * Restores a backup from Google Drive live into the data directory and triggers a soft bot restart.
     */
    public async restoreBackup(
        fileIdOrName: string,
        client?: any,
    ): Promise<{ restoredFiles: string[]; backupName: string }> {
        if (this.isBackingUp) {
            throw new Error('Cannot restore while a backup operation is currently in progress.');
        }

        this.reloadConfig();
        if (!this.driveClient.isConfigured()) {
            throw new Error('Google Drive credentials are not configured.');
        }

        logger.info(`Starting live restore for backup: ${fileIdOrName}`);

        // Resolve fileId: if user passed "latest" or a filename, find corresponding GoogleDriveFile
        let targetFileId = fileIdOrName.trim();
        let targetFileName = fileIdOrName.trim();

        if (targetFileId.toLowerCase() === 'latest' || targetFileId.startsWith('komaru_backup_')) {
            const files = await this.listBackups();
            if (files.length === 0) {
                throw new Error('No backups found on Google Drive to restore.');
            }

            if (targetFileId.toLowerCase() === 'latest') {
                targetFileId = files[0].id;
                targetFileName = files[0].name;
            } else {
                const found = files.find((f) => f.name === targetFileId || f.id === targetFileId);
                if (!found) {
                    throw new Error(
                        `Could not find backup matching "${fileIdOrName}" on Google Drive.`,
                    );
                }
                targetFileId = found.id;
                targetFileName = found.name;
            }
        }

        // Download archive from Google Drive
        const gzBuffer = await this.driveClient.downloadFile(targetFileId);

        // Unpack into data directory
        const restoredFiles = await unpackArchive(gzBuffer, this.dataDirectory);
        logger.info(`Restored ${restoredFiles.length} files from backup "${targetFileName}".`);

        // Perform Soft Bot Restart: reload configs and reload all modules
        await this.performSoftRestart(client);

        return {
            restoredFiles,
            backupName: targetFileName,
        };
    }

    /**
     * Soft bot restart: reloads configs from disk and re-registers all loaded modules.
     */
    public async performSoftRestart(client?: any): Promise<void> {
        logger.info('Performing live soft restart following backup restore...');

        // 1. Invalidate and reload all config caches
        config.reload();

        // 2. Reload all loaded modules
        if (client) {
            const allModules = moduleLoader.getAllModules();
            for (const mod of allModules) {
                try {
                    await moduleLoader.reloadModule(mod.name, client);
                } catch (err) {
                    logger.error(
                        `Error reloading module "${mod.name}" during soft restart: ${err}`,
                    );
                }
            }
        }

        logger.info('Live soft restart completed successfully.');
    }

    /**
     * Deletes older backups in Google Drive exceeding the retention count limit.
     */
    private async pruneOldBackups(): Promise<void> {
        const maxRetention = config.env.backupRetentionCount;
        if (!maxRetention || maxRetention <= 0) {
            return;
        }

        try {
            const files = await this.driveClient.listFiles({
                folderId: config.env.googleDriveFolderId,
                prefix: 'komaru_backup_',
            });

            if (files.length > maxRetention) {
                const toDelete = files.slice(maxRetention);
                logger.info(
                    `Pruning ${toDelete.length} old backup(s) exceeding retention limit of ${maxRetention}...`,
                );

                for (const file of toDelete) {
                    try {
                        await this.driveClient.deleteFile(file.id);
                        logger.info(`Deleted old backup: ${file.name} (${file.id})`);
                    } catch (err) {
                        logger.warn(`Failed to delete old backup ${file.id}: ${err}`);
                    }
                }
            }
        } catch (err) {
            logger.warn(`Failed to prune old backups: ${err}`);
        }
    }

    /**
     * Returns comprehensive system status for the backup service.
     */
    public getStatus(): BackupStatus {
        return {
            isConfigured: this.driveClient.isConfigured(),
            schedulerActive: Boolean(this.timerHandle),
            intervalMinutes: config.env.backupIntervalMinutes,
            retentionCount: config.env.backupRetentionCount,
            targetFolderId: config.env.googleDriveFolderId,
            clientEmail: this.driveClient.getClientEmail(),
            isBackingUp: this.isBackingUp,
            lastBackupTime: this.lastBackupTime,
            lastBackupName: this.lastBackupName,
            lastBackupSize: this.lastBackupSize,
            lastBackupStatus: this.lastBackupStatus,
            lastBackupError: this.lastBackupError,
            nextBackupTime: this.nextBackupTimestamp
                ? new Date(this.nextBackupTimestamp).toISOString()
                : undefined,
        };
    }

    public getDriveClient(): GoogleDriveClient {
        return this.driveClient;
    }
}

export const backupService = new BackupService();
