import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface ArchiveEntry {
    name: string;
    size: number;
    isDirectory: boolean;
    data?: Buffer;
    mtime?: number;
}

/**
 * Creates a standard 512-byte POSIX ustar tar header for a file or directory.
 */
function createTarHeader(
    name: string,
    size: number,
    isDirectory: boolean,
    mtimeSec: number,
): Buffer {
    const header = Buffer.alloc(512, 0);

    // Normalize path with forward slashes
    let normalizedName = name.replace(/\\/g, '/');
    if (isDirectory && !normalizedName.endsWith('/')) {
        normalizedName += '/';
    }

    // Support ustar prefix if name is longer than 100 bytes
    let prefix = '';
    let shortName = normalizedName;
    if (Buffer.byteLength(normalizedName) > 100) {
        const lastSlash = normalizedName.lastIndexOf('/', 155);
        if (lastSlash !== -1 && lastSlash <= 155) {
            prefix = normalizedName.slice(0, lastSlash);
            shortName = normalizedName.slice(lastSlash + 1);
        }
    }

    // Name (0..100)
    header.write(shortName, 0, 100, 'utf-8');

    // Mode (100..108)
    const mode = isDirectory ? '0000755\0' : '0000644\0';
    header.write(mode, 100, 8, 'ascii');

    // UID & GID (108..124)
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');

    // Size (124..136) - 11 octal digits + null
    const octalSize = (isDirectory ? 0 : size).toString(8).padStart(11, '0') + '\0';
    header.write(octalSize, 124, 12, 'ascii');

    // MTime (136..148)
    const octalMtime = mtimeSec.toString(8).padStart(11, '0') + '\0';
    header.write(octalMtime, 136, 12, 'ascii');

    // Checksum placeholder (148..156) filled with spaces (0x20)
    header.fill(0x20, 148, 156);

    // Typeflag (156) - '0' for file, '5' for directory
    header.write(isDirectory ? '5' : '0', 156, 1, 'ascii');

    // Magic (257..263) & Version (263..265)
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');

    // Prefix (345..500)
    if (prefix) {
        header.write(prefix, 345, 155, 'utf-8');
    }

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
        checksum += header[i];
    }
    const octalChecksum = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.write(octalChecksum, 148, 8, 'ascii');

    return header;
}

/**
 * Parses a 512-byte POSIX ustar tar header.
 */
function parseTarHeader(
    header: Buffer,
): { name: string; size: number; isDirectory: boolean; mtime: number } | null {
    // Check if the block is all zeros (indicates end of tar stream)
    const isZero = header.every((byte) => byte === 0);
    if (isZero) {
        return null;
    }

    // Read name and prefix
    const shortName = header.toString('utf-8', 0, 100).replace(/\0.*$/, '');
    const prefix = header.toString('utf-8', 345, 500).replace(/\0.*$/, '');
    const fullName = prefix ? `${prefix}/${shortName}` : shortName;

    if (!fullName) {
        return null;
    }

    // Read size (octal)
    const sizeStr = header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Read mtime
    const mtimeStr = header.toString('ascii', 136, 148).replace(/\0.*$/, '').trim();
    const mtime = parseInt(mtimeStr, 8) || 0;

    // Read typeflag
    const typeflag = header.toString('ascii', 156, 157);
    const isDirectory = typeflag === '5' || fullName.endsWith('/');

    return {
        name: fullName.replace(/\/$/, ''),
        size,
        isDirectory,
        mtime,
    };
}

/**
 * Packs a directory recursively into an in-memory or on-disk .tar.gz archive.
 *
 * @param sourceDir Absolute path of the directory to pack.
 * @param destFilePath Optional destination .tar.gz file path.
 * @returns Gzipped buffer containing the tar archive.
 */
export async function packDirectory(sourceDir: string, destFilePath?: string): Promise<Buffer> {
    const chunks: Buffer[] = [];

    function walk(currentDir: string, relativePath: string): void {
        if (!fs.existsSync(currentDir)) {
            return;
        }

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const entryAbsolute = path.join(currentDir, entry.name);

            const stat = fs.statSync(entryAbsolute);
            const mtimeSec = Math.floor(stat.mtimeMs / 1000);

            if (entry.isDirectory()) {
                const header = createTarHeader(entryRelative, 0, true, mtimeSec);
                chunks.push(header);
                walk(entryAbsolute, entryRelative);
            } else if (entry.isFile()) {
                const content = fs.readFileSync(entryAbsolute);
                const header = createTarHeader(entryRelative, content.length, false, mtimeSec);
                chunks.push(header);
                chunks.push(content);

                // Pad content to 512-byte boundary
                const remainder = content.length % 512;
                if (remainder !== 0) {
                    const padding = Buffer.alloc(512 - remainder, 0);
                    chunks.push(padding);
                }
            }
        }
    }

    walk(sourceDir, '');

    // End of tar archive: two 512-byte zero blocks
    chunks.push(Buffer.alloc(1024, 0));

    const tarBuffer = Buffer.concat(chunks);
    const gzBuffer = zlib.gzipSync(tarBuffer, { level: 9 });

    if (destFilePath) {
        const destDir = path.dirname(destFilePath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.writeFileSync(destFilePath, gzBuffer);
    }

    return gzBuffer;
}

/**
 * Unpacks a .tar.gz archive Buffer or file into a destination directory.
 * Includes path traversal security sanitization.
 *
 * @param gzInput Buffer or path to .tar.gz file.
 * @param targetDir Destination directory where files will be unpacked.
 * @returns List of extracted relative file paths.
 */
export async function unpackArchive(
    gzInput: Buffer | string,
    targetDir: string,
): Promise<string[]> {
    const gzBuffer = typeof gzInput === 'string' ? fs.readFileSync(gzInput) : gzInput;
    const tarBuffer = zlib.gunzipSync(gzBuffer);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const extractedFiles: string[] = [];
    let offset = 0;

    while (offset + 512 <= tarBuffer.length) {
        const headerBlock = tarBuffer.subarray(offset, offset + 512);
        const header = parseTarHeader(headerBlock);
        offset += 512;

        if (!header) {
            // Null block reached, check for second null block or EOF
            break;
        }

        // Security check: Path Traversal Prevention
        const safeName = path.normalize(header.name).replace(/^(\.\.(\/|\\|$))+/, '');
        const targetPath = path.resolve(targetDir, safeName);
        const resolvedTargetDir = path.resolve(targetDir);

        if (!targetPath.startsWith(resolvedTargetDir)) {
            throw new Error(
                `Security Exception: archive entry '${header.name}' attempts path traversal.`,
            );
        }

        if (header.isDirectory) {
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }
            extractedFiles.push(safeName);
        } else {
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const fileData = tarBuffer.subarray(offset, offset + header.size);
            fs.writeFileSync(targetPath, fileData);

            // Move offset past content + 512-byte padding
            const remainder = header.size % 512;
            const padding = remainder === 0 ? 0 : 512 - remainder;
            offset += header.size + padding;

            extractedFiles.push(safeName);
        }
    }

    return extractedFiles;
}
