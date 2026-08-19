const { REST, Routes } = require('discord.js');
import { logger } from './logger';
import { commandRegistry } from './commandRegistry';

export async function syncCommands(
    token: string,
    clientId: string | undefined,
    guildId?: string,
): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(token);
    const commands = commandRegistry.toSlashCommandData();

    if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId ?? 'missing', guildId), {
            body: commands,
        });
    } else {
        await rest.put(Routes.applicationCommands(clientId ?? 'missing'), {
            body: commands,
        });
    }

    logger.info(`Commands synced: ${commands.length} commands registered`);
}

export async function cleanAndSyncCommands(
    token: string,
    clientId: string | undefined,
    guildId?: string,
): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(token);
    const targetClientId = clientId ?? 'missing';

    if (guildId) {
        await rest.put(Routes.applicationGuildCommands(targetClientId, guildId), {
            body: [],
        });
        await rest.put(Routes.applicationCommands(targetClientId), {
            body: [],
        });
    } else {
        await rest.put(Routes.applicationCommands(targetClientId), {
            body: [],
        });
    }

    logger.info('Cleaned all slash commands');

    await syncCommands(token, clientId, guildId);
}

export async function restartBot(): Promise<void> {
    logger.info('Restart requested');
    process.exit(0);
}

export async function stopBot(): Promise<void> {
    logger.info('Stop requested');
    process.exit(0);
}
