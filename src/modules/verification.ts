
import { ActionRowBuilder, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle } from 'discord.js';
import { commandRegistry } from '../commandRegistry';

// TODO: Change with actual channel ids
const verificationChannelsAllowed = ['screenshots', 'panoramas'];
const verificationChannelId = 'verification_channel';
const verifierRoleId = 'verifier_role';
const stargateRoleIds = [
    {name: 'Legacy CSG', value: 'legacy_csg_role'},
    {name: 'ASG', value: 'asg_role'},
    {name: 'DSG', value: 'dsg_role'},
];

const buildVerificationForm = (): ModalBuilder => {
    const modal = new ModalBuilder()
        .setCustomId('verification_form')
        .setTitle('📝 Gate Run Verification')
        .setComponents([
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('role')
                    .setLabel('What are you verifying for?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Legacy CSG, ASG, or DSG')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('modifications')
                    .setLabel('Did you modify the modpack in any way? If yes, please list all the modifications you made.')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Ex. Added a new mod, changed a config, no modifications, etc.')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('versions')
                    .setLabel('In what version(s) did you play for this run?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex. Theta 1, Eta 3 updated to Theta 1, etc.')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('method')
                    .setLabel('Did you play on a server or singleplayer?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Ex. server, singleplayer, etc.')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('playtime')
                    .setLabel('What is your playtime (and your teamates\' if you had any)? (/leaderboard time_played)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Ex. trulyno - 12.5d, komaru - 10.5d, etc.')
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('cheats')
                    .setLabel('Did you (or your teammates) cheat anything in? If yes, what?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('Ex. nothing, cheated in building blocks, etc.')
            ),
        ]);

    return modal;
}

async function handleVerificationForm(interaction: ModalSubmitInteraction): Promise<void> {
    const values = getFieldValues(interaction);
    // Create a 
}

function getFieldValues(interaction: ModalSubmitInteraction): Record<string, string> {
    return {
        role: interaction.fields.getTextInputValue('role').trim(),
        modifications: interaction.fields.getTextInputValue('modifications').trim(),
        versions: interaction.fields.getTextInputValue('versions').trim(),
        method: interaction.fields.getTextInputValue('method').trim(),
        playtime: interaction.fields.getTextInputValue('playtime').trim(),
        cheats: interaction.fields.getTextInputValue('cheats').trim(),
    };
}

const moduleDefinition = {
    name: 'verification',
    description: 'Verification for stargate roles',
    register: async (client: any) => {
        // flow:
        /*
         * 1. User runs the command /verify
         * 2. If the channel the commeand was run in is not a verification channel, reply with an error message
         * 3. If the channel is a verification channel, open a modal form to fill out the verification details
         * 4. After the user fills out the form, send an embed with the answers in the same channel and send a notification about the verification request in the verification channel to allert the verifyiers
         * 5. When a verifyier runs the command /complete_verification (parameters are user and role), the bot will add the role to the user and send a notification in the verification chat
        */
        commandRegistry.register({
            name: 'verify',
            description: 'Requests a gate run verification',
            handler: async (interaction: any) => {
                // opens a form to fill out the verification details
            }
        });
        commandRegistry.register({
            name: 'complete_verification',
            description: 'Awards a user a stargate role',
            options: [
                {
                    name: 'user',
                    description: 'The user to award the role to',
                    type: 6,
                    required: true,
                },
                {
                    name: 'role',
                    description: 'The role to award the user',
                    type: 3,
                    required: true,
                    choices: stargateRoleIds,
                }
            ],
            handler: async (interaction: any) => {
                
            }
        })
    }
};

export default moduleDefinition;
export const module = moduleDefinition;