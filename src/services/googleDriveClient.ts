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
    impersonatedUser?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthRefreshToken?: string;
}

export interface GoogleDriveFile {
    id: string;
    name: string;
    size?: string | number;
    createdTime?: string;
    modifiedTime?: string;
    mimeType?: string;
}

export type GoogleDriveAuthType = 'service_account' | 'oauth2' | 'unconfigured';

interface ServiceAccountKeyFile {
    client_email?: string;
    private_key?: string;
}

function base64UrlEncode(data: string | Buffer): string {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function formatDriveApiError(action: string, status: number, errorText: string): Error {
    if (
        status === 403 &&
        (errorText.includes('storageQuotaExceeded') ||
            errorText.includes('Service Accounts do not have storage quota'))
    ) {
        return new Error(
            `Google Drive ${action} failed (403): Service Accounts have 0 GB personal storage quota.\n` +
                `To fix this, choose one of these options:\n` +
                `1. Store backups in a Google Workspace Shared Drive and add the Service Account as Content Manager (set GOOGLE_DRIVE_FOLDER_ID to the Shared Drive or folder ID).\n` +
                `2. Use OAuth2 User Credentials for personal @gmail.com accounts (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN).\n` +
                `3. Enable Google Workspace Domain-Wide Delegation (set GOOGLE_SERVICE_ACCOUNT_IMPERSONATED_USER).\n` +
                `Original response: ${errorText}`,
        );
    }
    return new Error(`Google Drive ${action} failed (${status}): ${errorText}`);
}

export class GoogleDriveClient {
    private clientEmail?: string;
    private privateKey?: string;
    private folderId?: string;
    private impersonatedUser?: string;

    private oauthClientId?: string;
    private oauthClientSecret?: string;
    private oauthRefreshToken?: string;

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
        this.impersonatedUser = creds.impersonatedUser;
        this.oauthClientId = creds.oauthClientId;
        this.oauthClientSecret = creds.oauthClientSecret;
        this.oauthRefreshToken = creds.oauthRefreshToken;

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

    public getAuthType(): GoogleDriveAuthType {
        if (this.oauthClientId && this.oauthClientSecret && this.oauthRefreshToken) {
            return 'oauth2';
        }
        if (this.clientEmail && this.privateKey) {
            return 'service_account';
        }
        return 'unconfigured';
    }

    public isConfigured(): boolean {
        return this.getAuthType() !== 'unconfigured';
    }

    public getFolderId(): string | undefined {
        return this.folderId;
    }

    public getClientEmail(): string | undefined {
        return this.clientEmail;
    }

    public getImpersonatedUser(): string | undefined {
        return this.impersonatedUser;
    }

    /**
     * Obtains a valid Google OAuth2 access token via Refresh Token or RS256 JWT Assertion.
     */
    public async getAccessToken(): Promise<string> {
        const nowSec = Math.floor(Date.now() / 1000);
        if (this.cachedAccessToken && this.tokenExpiryTime > nowSec + 60) {
            return this.cachedAccessToken;
        }

        const authType = this.getAuthType();

        if (authType === 'oauth2') {
            const tokenUrl = 'https://oauth2.googleapis.com/token';
            const body = new URLSearchParams({
                client_id: this.oauthClientId!,
                client_secret: this.oauthClientSecret!,
                refresh_token: this.oauthRefreshToken!,
                grant_type: 'refresh_token',
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
                    `Google OAuth2 refresh token request failed (${response.status}): ${errorText}`,
                );
            }

            const data = (await response.json()) as { access_token: string; expires_in: number };
            this.cachedAccessToken = data.access_token;
            this.tokenExpiryTime = nowSec + (data.expires_in || 3600);

            return this.cachedAccessToken;
        }

        if (authType === 'service_account') {
            const header = {
                alg: 'RS256',
                typ: 'JWT',
            };

            const payload: Record<string, any> = {
                iss: this.clientEmail,
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
                aud: 'https://oauth2.googleapis.com/token',
                exp: nowSec + 3600,
                iat: nowSec,
            };

            if (this.impersonatedUser) {
                payload.sub = this.impersonatedUser;
            }

            const encodedHeader = base64UrlEncode(JSON.stringify(header));
            const encodedPayload = base64UrlEncode(JSON.stringify(payload));
            const signingInput = `${encodedHeader}.${encodedPayload}`;

            const signer = crypto.createSign('RSA-SHA256');
            signer.update(signingInput);
            signer.end();
            const signature = signer.sign(this.privateKey!);
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

        throw new Error(
            'Google Drive credentials are not configured. Please configure Service Account or OAuth2 credentials.',
        );
    }

    /**
     * Uploads a file (Buffer) to Google Drive via multipart upload with Shared Drive support.
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
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,modifiedTime,mimeType&supportsAllDrives=true';

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
            throw formatDriveApiError('file upload', response.status, errorText);
        }

        return (await response.json()) as GoogleDriveFile;
    }

    /**
     * Lists files from Google Drive matching the query / folder with Shared Drive support.
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
        url.searchParams.set('supportsAllDrives', 'true');
        url.searchParams.set('includeItemsFromAllDrives', 'true');
        url.searchParams.set('corpora', 'allDrives');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw formatDriveApiError('list files', response.status, errorText);
        }

        const data = (await response.json()) as { files?: GoogleDriveFile[] };
        return data.files || [];
    }

    /**
     * Downloads a file from Google Drive as a Buffer with Shared Drive support.
     */
    public async downloadFile(fileId: string): Promise<Buffer> {
        const token = await this.getAccessToken();
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

        const response = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw formatDriveApiError(
                `file download for fileId ${fileId}`,
                response.status,
                errorText,
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Deletes a file from Google Drive with Shared Drive support.
     */
    public async deleteFile(fileId: string): Promise<void> {
        const token = await this.getAccessToken();
        const deleteUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`;

        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok && response.status !== 404) {
            const errorText = await response.text();
            throw formatDriveApiError(
                `file delete for fileId ${fileId}`,
                response.status,
                errorText,
            );
        }
    }
}
