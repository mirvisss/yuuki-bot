const botLogger = require('../lib/botLogger');

module.exports = {
    name: 'guildDelete',

    async execute(guild, client) {
        botLogger.logGuildLeave(guild, client).catch(() => {});
    }
};

/**
 * Project: Yuuki
 * License: Custom
 */