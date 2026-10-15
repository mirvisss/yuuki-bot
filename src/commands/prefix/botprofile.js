module.exports = {
    name: 'botprofile',
    description: 'Show bot profile commands',
    aliases: [],
    async execute(message, args) {
        if (!args || !args.length) {
            return require('../../lib/helpMenu').sendHelp('botprofile', message);
        }
        return require('../../lib/helpMenu').sendHelp('botprofile', message);
    }
};

/**
 * Project: Yuuki
 * License: Custom
 */