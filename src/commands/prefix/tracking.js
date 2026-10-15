module.exports = {
    name: 'tracking',
    description: 'Show tracking commands',
    aliases: [],
    async execute(message, args) {
        if (!args || !args.length) {
            return require('../../lib/helpMenu').sendHelp('tracking', message);
        }
        return require('../../lib/helpMenu').sendHelp('tracking', message);
    }
};

/**
 * Project: Yuuki
 * License: Custom
 */