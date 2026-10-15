module.exports = {
    name: 'social',
    description: 'Show social commands',
    aliases: [],
    async execute(message, args) {
        if (!args || !args.length) {
            return require('../../lib/helpMenu').sendHelp('social', message);
        }
        return require('../../lib/helpMenu').sendHelp('social', message);
    }
};

/**
 * Project: Yuuki
 * License: Custom
 */