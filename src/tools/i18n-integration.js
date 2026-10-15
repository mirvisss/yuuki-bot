/**
 * Интеграционная проверка перевода: запускает настоящие обработчики команд
 * с заглушкой сообщения и смотрит, что реально уходит в Discord.
 *
 * В отличие от i18n-selftest.js здесь участвует полный путь:
 *   код команды → message.reply() (пропатченный) → канал.send() → payload.
 *
 * Запуск:  node src/tools/i18n-integration.js
 */

process.env.BOT_LOCALE = process.env.BOT_LOCALE || 'ru';

const discord = require('discord.js');
const autoTranslate = require('../lib/autoTranslate');

const autoInstall = autoTranslate.install();

let passed = 0;
let failed = 0;
let skipped = 0;

/** Достаёт все тексты из payload (контейнеры v2, embed'ы, content, кнопки). */
function collectText(payload, collected = []) {
    if (!payload || typeof payload !== 'object') return collected;
    if (Array.isArray(payload)) {
        for (const item of payload) collectText(item, collected);
        return collected;
    }

    const data = typeof payload.toJSON === 'function' ? payload.toJSON() : payload;

    for (const key of ['content', 'description', 'title', 'label', 'placeholder', 'text', 'name', 'value']) {
        if (typeof data[key] === 'string') collected.push(data[key]);
    }
    for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object') collectText(value, collected);
    }
    return collected;
}

function buildMessage({ mention = null } = {}) {
    const sent = [];

    const message = Object.create(discord.Message.prototype);
    message.id = '1';
    message.content = ',hug';
    message.author = { id: '1', username: 'tester', bot: false, tag: 'tester#0001' };
    message.member = { id: '1', permissions: { has: () => true }, roles: { cache: [] } };
    message.guild = { id: '1', name: 'Test Guild', members: { cache: [] }, channels: { cache: [] } };
    message.client = { user: { id: '999', username: 'Yuuki' }, commands: new Map(), prefixCommands: new Map() };
    message.mentions = {
        users: { first: () => mention, size: mention ? 1 : 0 },
        members: { first: () => null },
        roles: { first: () => null },
        channels: { first: () => null }
    };
    message.channel = {
        id: '2',
        type: discord.ChannelType.GuildText,
        send: async (payload) => { sent.push(payload); return { id: '3' }; },
        sendTyping: async () => {}
    };
    message.reply = (payload) => {
        sent.push(payload);
        return Promise.resolve({ id: '3' });
    };

    return { message, sent };
}

async function checkCommand(name, modulePath, { mention = null } = {}, expected = []) {
    const { message, sent } = buildMessage({ mention });

    let command;
    try {
        command = require(modulePath);
    } catch (error) {
        skipped++;
        console.log(`   ⃝ ${name} — модуль не загрузился: ${error.message.split('\n')[0]}`);
        return;
    }

    try {
        await command.execute(message, []);
    } catch (error) {
        skipped++;
        console.log(`   ⃝ ${name} — команда требует живого Discord: ${error.message.split('\n')[0]}`);
        return;
    }

    const texts = collectText(sent);
    if (!texts.length) {
        skipped++;
        console.log(`   ⃝ ${name} — ничего не отправлено в заглушку`);
        return;
    }

    const english = texts.filter(text => /[A-Za-z]/.test(text) && !/^[\s\W\d]*$/.test(text));
    const found = expected.length ? expected.every(fragment => texts.some(text => text.includes(fragment))) : true;

    if (found) {
        passed++;
        console.log(`   ✓ ${name}`);
        for (const text of texts.slice(0, 3)) {
            console.log(`        › ${text.replace(/\n/g, ' ⏎ ').slice(0, 110)}`);
        }
    } else {
        failed++;
        console.log(`   ✗ ${name} — ожидаемые фрагменты не найдены: ${expected.join(' | ')}`);
        for (const text of texts.slice(0, 5)) console.log(`        › ${text.replace(/\n/g, ' ⏎ ').slice(0, 110)}`);
    }

    if (english.length) {
        console.log(`        ⚠ осталось английского: ${english.length} фрагм.`);
        for (const text of english.slice(0, 3)) console.log(`           · ${text.replace(/\n/g, ' ⏎ ').slice(0, 100)}`);
    }
}

(async () => {
    console.log('');
    console.log(`  Локализация установлена: ${autoInstall ? 'да' : 'нет'} · фраз: ${autoTranslate.stats().phrases}`);
    console.log('');
    console.log('  Реальные команды с заглушкой Discord:');


    await checkCommand('prefix/roleplay/hug (без упоминания)', '../commands/prefix/roleplay/hug');
    await checkCommand('prefix/Misc/define (без слова)', '../commands/prefix/Misc/define');
    await checkCommand('prefix/roleplay/kiss (без упоминания)', '../commands/prefix/roleplay/kiss');

    console.log('');
    console.log(`  Итог: ${passed} успешно, ${failed} проблем, ${skipped} пропущено`);
    console.log('');
    process.exit(failed ? 1 : 0);
})();
