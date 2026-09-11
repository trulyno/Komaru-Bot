import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';

export interface GoogleDriveCredentials {
    clientEmail?: string;
    privateKey?: string;
    keyFilePath?: string;
    rawJson?: string;
    folderId?: string;
}

export interface GoogleDriveFile {
    id: string;
    name: string;
    size?: string | number;
    createdTime?: string;
    modifiedTime?: string;
    mimeType?: string;
}

interface ServiceAccountKeyFile {
    client_email?: string;
    private_key?: string;
}

function base64UrlEncode(data: string | Buffer): string {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export class GoogleDriveClient {
    private clientEmail?: string;
    private privateKey?: string;
    private folderId?: string;

    private cachedAccessToken?: string;
    private tokenExpiryTime = 0;

    constructor(credentials?: GoogleDriveCredentials) {
        if (credentials) {
            this.loadCredentials(credentials);
        }
    }

    public loadCredentials(creds: GoogleDriveCredentials): void {
        this.folderId = creds.folderId;
        this.clientEmail = creds.clientEmail;
        this.privateKey = creds.privateKey;

        // Try raw JSON credentials
        if (creds.rawJson) {
            try {
                const parsed = JSON.parse(creds.rawJson) as ServiceAccountKeyFile;
                if (parsed.client_email) {
                    this.clientEmail = parsed.client_email;
                }
                if (parsed.private_key) {
                    this.privateKey = parsed.private_key;
                }
            } catch (err) {
                logger.error(`Failed to parse raw Google Service Account JSON: ${err}`);
            }
        }

        // Try key file path
        if (creds.keyFilePath && (!this.clientEmail || !this.privateKey)) {
            try {
                const resolvedPath = path.isAbsolute(creds.keyFilePath)
                    ? creds.keyFilePath
                    : path.resolve(process.cwd(), creds.keyFilePath);

                if (fs.existsSync(resolvedPath)) {
                    const raw = fs.readFileSync(resolvedPath, 'utf-8');
                    const parsed = JSON.parse(raw) as ServiceAccountKeyFile;
                    if (parsed.client_email) {
                        this.clientEmail = parsed.client_email;
                    }
                    if (parsed.private_key) {
                        this.privateKey = parsed.private_key;
                    }
                }
            } catch (err) {
                logger.error(
                    `Failed to load Google Service Account file from ${creds.keyFilePath}: ${err}`,
                );
            }
        }

        // Clean private key formatting
        if (this.privateKey) {
            this.privateKey = this.privateKey.replace(/\\n/g, '\n');
        }
    }

    public isConfigured(): boolean {
        return Boolean(this.clientEmail && this.privateKey);
    }

    public getFolderId(): string | undefined {
        return this.folderId;
    }

    public getClientEmail(): string | undefined {
        return this.clientEmail;
    }

    /**
     * Generates a signed RS256 JWT assertion and exchanges it for a Google OAuth2 access token.
     */
    public async getAccessToken(): Promise<string> {
        const nowSec = Math.floor(Date.now() / 1000);
        if (this.cachedAccessToken && this.tokenExpiryTime > nowSec + 60) {
            return this.cachedAccessToken;
        }

        if (!this.clientEmail || !this.privateKey) {
            throw new Error('Google Drive Service Account credentials are not configured.');
        }

        const header = {
            alg: 'RS256',
            typ: 'JWT',
        };

        const payload = {
            iss: this.clientEmail,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
            aud: 'https://oauth2.googleapis.com/token',
            exp: nowSec + 3600,
            iat: nowSec,
        };

        const encodedHeader = base64UrlEncode(JSON.stringify(header));
        const encodedPayload = base64UrlEncode(JSON.stringify(payload));
        const signingInput = `${encodedHeader}.${encodedPayload}`;

        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signingInput);
        signer.end();
        const signature = signer.sign(this.privateKey);
        const encodedSignature = base64UrlEncode(signature);

        const jwtAssertion = `${signingInput}.${encodedSignature}`;

        const tokenUrl = 'https://oauth2.googleapis.com/token';
        const body = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwtAssertion,
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Google OAuth2 token request failed (${response.status}): ${errorText}`,
            );
        }

        const data = (await response.json()) as { access_token: string; expires_in: number };
        this.cachedAccessToken = data.access_token;
        this.tokenExpiryTime = nowSec + (data.expires_in || 3600);

        return this.cachedAccessToken;
    }

    /**
     * Uploads a file (Buffer) to Google Drive via multipart upload.
     */
    public async uploadFile(options: {
        name: string;
        mimeType: string;
        data: Buffer;
        folderId?: string;
    }): Promise<GoogleDriveFile> {
        const token = await this.getAccessToken();
        const targetFolder = options.folderId || this.folderId;

        const metadata: Record<string, any> = {
            name: options.name,
            mimeType: options.mimeType,
        };

        if (targetFolder) {
            metadata.parents = [targetFolder];
        }

        const boundary = `-------314159265358979323846_${Date.now()}`;
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const metadataPart = Buffer.from(
            `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
            'utf-8',
        );

        const mediaHeaderPart = Buffer.from(
            `${delimiter}Content-Type: ${options.mimeType}\r\n\r\n`,
            'utf-8',
        );

        const closingPart = Buffer.from(closeDelimiter, 'utf-8');

        const multipartBody = Buffer.concat([
            metadataPart,
            mediaHeaderPart,
            options.data,
            closingPart,
        ]);

        const uploadUrl =
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,modifiedTime,mimeType';

        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': String(multipartBody.length),
            },
            body: multipartBody,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Drive file upload failed (${response.status}): ${errorText}`);
        }

        return (await response.json()) as GoogleDriveFile;
    }

    /**
     * Lists files from Google Drive matching the query / folder.
     */
    public async listFiles(options?: {
        folderId?: string;
        prefix?: string;
        pageSize?: number;
    }): Promise<GoogleDriveFile[]> {
        const token = await this.getAccessToken();
        const targetFolder = options?.folderId || this.folderId;

        const queryParts: string[] = ['trashed = false'];
        if (targetFolder) {
            queryParts.push(`'${targetFolder}' in parents`);
        }
        if (options?.prefix) {
            queryParts.push(`name contains '${options.prefix}'`);
        }

        const q = queryParts.join(' and ');
        const pageSize = options?.pageSize || 100;
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.set('q', q);
        url.searchParams.set('pageSize', String(pageSize));
        url.searchParams.set('orderBy', 'createdTime desc');
        url.searchParams.set('fields', 'files(id,name,size,createdTime,modifiedTime,mimeType)');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Drive list files failed (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as { files?: GoogleDriveFile[] };
        return data.files || [];
    }

    /**
     * Downloads a file from Google Drive as a Buffer.
     */
    public async downloadFile(fileId: string): Promise<Buffer> {
        const token = await this.getAccessToken();
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

        const response = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Google Drive file download failed for fileId ${fileId} (${response.status}): ${errorText}`,
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Deletes a file from Google Drive.
     */
    public async deleteFile(fileId: string): Promise<void> {
        const token = await this.getAccessToken();
        const deleteUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;

        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok && response.status !== 404) {
            const errorText = await response.text();
            throw new Error(
                `Google Drive file delete failed for fileId ${fileId} (${response.status}): ${errorText}`,
            );
        }
    }
}
