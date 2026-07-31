import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = path.resolve(process.cwd(), 'logs');

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
        const base = `${timestamp} [${level}] ${message}`;
        return stack ? `${base}\n${stack}` : base;
    }),
);

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
        const base = `${timestamp} [${level}] ${message}`;
        return stack ? `${base}\n${stack}` : base;
    }),
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new DailyRotateFile({
            dirname: logDir,
            filename: 'komaru-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: fileFormat,
        }),
    ],
});

export function logError(error: unknown, context?: string): void {
    if (error instanceof Error) {
        logger.error(context ? `${context}: ${error.message}` : error.message, {
            stack: error.stack,
        });
        return;
    }

    logger.error(context ? `${context}: ${String(error)}` : String(error));
}
