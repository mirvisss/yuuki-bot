const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Get the support server invite link'),

    name: 'support',
    aliases: [],
    description: 'Get the support server invite link',

    async execute(interactionOrMessage) {
        const config = require('../../config');
        return interactionOrMessage.reply(config.SUPPORT_SERVER);
    }
};

/**
 * Project: Yuuki
 * License: Custom
 */