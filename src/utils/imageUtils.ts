import zlib from 'node:zlib';

/**
 * Standard CRC32 table for PNG chunk checksum calculations.
 */
const crcTable: number[] = new Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        if (c & 1) {
            c = 0xedb88320 ^ (c >>> 1);
        } else {
            c = c >>> 1;
        }
    }
    crcTable[n] = c;
}

/**
 * Calculates CRC32 checksum of a buffer.
 */
export function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Converts a hex color string (e.g. "#FF5733" or "FF5733") to RGB components.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const cleanHex = hex.replace(/^#/, '').trim();
    let r = 0;
    let g = 0;
    let b = 0;

    if (cleanHex.length === 3) {
        r = parseInt(cleanHex[0] + cleanHex[0], 16);
        g = parseInt(cleanHex[1] + cleanHex[1], 16);
        b = parseInt(cleanHex[2] + cleanHex[2], 16);
    } else if (cleanHex.length === 6) {
        r = parseInt(cleanHex.substring(0, 2), 16);
        g = parseInt(cleanHex.substring(2, 4), 16);
        b = parseInt(cleanHex.substring(4, 6), 16);
    }

    return {
        r: isNaN(r) ? 0 : Math.max(0, Math.min(255, r)),
        g: isNaN(g) ? 0 : Math.max(0, Math.min(255, g)),
        b: isNaN(b) ? 0 : Math.max(0, Math.min(255, b)),
    };
}

/**
 * Converts RGB components to a standard 6-digit hex string with '#' prefix.
 */
export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(n)));
        return clamped.toString(16).padStart(2, '0').toUpperCase();
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Formats RGB components into a standard CSS string e.g. "rgb(255, 87, 51)".
 */
export function formatRgbString(r: number, g: number, b: number): string {
    return `rgb(${Math.max(0, Math.min(255, Math.round(r)))}, ${Math.max(0, Math.min(255, Math.round(g)))}, ${Math.max(0, Math.min(255, Math.round(b)))})`;
}

/**
 * Generates a random valid hex color string (e.g. "#4A90E2").
 */
export function getRandomHexColor(): string {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return rgbToHex(r, g, b);
}

/**
 * Generates a pure PNG Buffer representing a solid color square.
 * Zero external native dependencies; uses standard Node.js zlib.
 *
 * @param hex Hex color string (e.g. "#FF5733")
 * @param size Width and height in pixels (default: 128)
 */
export function generateColorSquarePng(hex: string, size = 128): Buffer {
    const width = Math.max(1, Math.min(512, Math.round(size)));
    const height = width;
    const { r, g, b } = hexToRgb(hex);

    // PNG signature (8 bytes)
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk: 13 bytes data (width(4), height(4), bitDepth(1), colorType(1), comp(1), filter(1), interlace(1))
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8); // 8 bits per channel
    ihdrData.writeUInt8(2, 9); // Color type 2 (Truecolor RGB)
    ihdrData.writeUInt8(0, 10); // Compression 0 (Deflate)
    ihdrData.writeUInt8(0, 11); // Filter method 0
    ihdrData.writeUInt8(0, 12); // Interlace 0 (None)

    const ihdrChunk = createPngChunk('IHDR', ihdrData);

    // IDAT chunk: Raw scanlines with filter byte 0 (None) at the start of each scanline
    const rowSize = 1 + width * 3;
    const rawScanlines = Buffer.alloc(height * rowSize);

    for (let y = 0; y < height; y++) {
        const offset = y * rowSize;
        rawScanlines.writeUInt8(0, offset); // Filter type 0
        for (let x = 0; x < width; x++) {
            const pixelOffset = offset + 1 + x * 3;
            rawScanlines.writeUInt8(r, pixelOffset);
            rawScanlines.writeUInt8(g, pixelOffset + 1);
            rawScanlines.writeUInt8(b, pixelOffset + 2);
        }
    }

    const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
    const idatChunk = createPngChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Creates a PNG chunk with length, type, data, and CRC32 checksum.
 */
function createPngChunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, 'ascii');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length, 0);

    const typeAndData = Buffer.concat([typeBuf, data]);
    const checksum = crc32(typeAndData);

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(checksum, 0);

    return Buffer.concat([lengthBuf, typeAndData, crcBuf]);
}
