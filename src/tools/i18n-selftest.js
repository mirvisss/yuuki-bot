/**
 * Самопроверка локализации: проверяет, что исходящий текст реально переводится
 * на всех путях, которыми бот отвечает в Discord (embed'ы, компоненты v2,
 * кнопки, меню, обычные сообщения).
 *
 * Запуск:  node src/tools/i18n-selftest.js
 */

process.env.BOT_LOCALE = process.env.BOT_LOCALE || 'ru';

const discord = require('discord.js');
const assert = require('assert');
const autoTranslate = require('../lib/autoTranslate');
const { t, tp } = require('../lib/i18n');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
    try {
        assert.strictEqual(actual, expected);
        passed++;
        console.log(`   ✓ ${name}`);
    } catch (error) {
        failed++;
        console.log(`   ✗ ${name}\n       получено:  ${JSON.stringify(actual)}\n       ожидалось: ${JSON.stringify(expected)}`);
    }
}

function checkContains(name, actual, expectedFragment) {
    if (String(actual).includes(expectedFragment)) {
        passed++;
        console.log(`   ✓ ${name}`);
    } else {
        failed++;
        console.log(`   ✗ ${name}\n       получено:  ${JSON.stringify(actual)}\n       нет фрагмента: ${JSON.stringify(expectedFragment)}`);
    }
}

autoTranslate.install();
const { phrases } = autoTranslate.stats();

console.log('');
console.log(`  Словарь: ${phrases} фраз`);
console.log('');
console.log('  Точные фразы и шаблоны:');

check('точное совпадение', autoTranslate.translateText('Only the command user can use this menu!'), 'Меню доступно только автору команды!');
check('длинная фраза', autoTranslate.translateText('You need Administrator permission to use this command.'), 'Для использования этой команды нужны права администратора.');
check('шаблон с числами', autoTranslate.translateText('Page 2 of 5'), 'Страница 2 из 5');
check('шаблон с жирным именем и числом', autoTranslate.translateText('**mirviss** Text is too long! Maximum 500 characters.'), '**mirviss** Текст слишком длинный! Максимум 500 символов.');
check('шаблон с упоминанием и числом', autoTranslate.translateText('Banned <@123456789012345678> for 3 days'), 'Banned <@123456789012345678> for 3 days');
check('неизвестная строка не меняется', autoTranslate.translateText('Some totally unknown string here'), 'Some totally unknown string here');
check('пустая строка', autoTranslate.translateText(''), '');
check('русский текст не трогается', autoTranslate.translateText('Уже на русском'), 'Уже на русском');

console.log('');
console.log('  Многострочный текст (перевод построчно):');
const multiline = [
    'Select modules to enable',
    '  Voice channel',
    'Something unknown here',
    '> Use {0} to modify or {1} to start over.'
].join('\n');
const translatedMultiline = autoTranslate.translateText(multiline);
const multilineLines = translatedMultiline.split('\n');
checkContains('первая строка', multilineLines[0], 'Выберите модули');
checkContains('строка с отступом', multilineLines[1], 'Голосовой канал');
checkContains('отступ сохранён', multilineLines[1], '  ');
checkContains('неизвестная строка осталась', multilineLines[2], 'Something unknown here');
checkContains('строка с {0}', multilineLines[3], 'изменить');

console.log('');
console.log('  Через реальные объекты discord.js:');

const embed = new discord.EmbedBuilder().setDescription('Only the command user can use this menu!');
check('EmbedBuilder.setDescription', embed.data.description, 'Меню доступно только автору команды!');

const embedField = new discord.EmbedBuilder().addFields({ name: 'Select modules to enable', value: 'Voice channel' });
check('EmbedBuilder.addFields name', embedField.data.fields[0].name, 'Выберите модули для включения');
check('EmbedBuilder.addFields value', embedField.data.fields[0].value, 'Голосовой канал');

const button = new discord.ButtonBuilder().setCustomId('x').setStyle(discord.ButtonStyle.Primary).setLabel('Select modules to enable');
check('ButtonBuilder.setLabel', button.data.label, 'Выберите модули для включения');

const option = new discord.StringSelectMenuOptionBuilder().setValue('x').setLabel('This button is not for you!').setDescription('Voice channel');
check('StringSelectMenuOptionBuilder label', option.data.label, 'Эта кнопка не для вас!');
check('StringSelectMenuOptionBuilder description', option.data.description, 'Голосовой канал');

if (discord.TextDisplayBuilder) {
    const display = new discord.TextDisplayBuilder().setContent('Only the command user can use this menu!');
    check('TextDisplayBuilder.setContent', display.data.content, 'Меню доступно только автору команды!');
}

if (discord.ModalBuilder) {
    const modal = new discord.ModalBuilder().setCustomId('m').setTitle('Select modules to enable');
    check('ModalBuilder.setTitle', modal.data.title, 'Выберите модули для включения');
}

console.log('');
console.log('  Полезная нагрузка сообщения целиком (то, что уходит в API):');
const payload = autoTranslate.translatePayload({
    content: 'Only the command user can use this menu!',
    embeds: [{ title: 'Select modules to enable', fields: [{ name: 'Voice channel', value: 'Page 1 of 2' }] }],
    components: [{ components: [{ label: 'This button is not for you!', placeholder: 'Select which protection modules to enable:', custom_id: 'x' }] }]
});
check('content', payload.content, 'Меню доступно только автору команды!');
check('embeds[].title', payload.embeds[0].title, 'Выберите модули для включения');
check('embeds[].fields[].name', payload.embeds[0].fields[0].name, 'Голосовой канал');
check('embeds[].fields[].value', payload.embeds[0].fields[0].value, 'Страница 1 из 2');
check('components label', payload.components[0].components[0].label, 'Эта кнопка не для вас!');
check('components placeholder', payload.components[0].components[0].placeholder, 'Выберите, какие модули защиты включить:');
check('custom_id не тронут', payload.components[0].components[0].custom_id, 'x');

console.log('');
console.log('  Ключевая система (src/lib/i18n.js) работает параллельно:');
check('t() с ключом', t('cmd.moderation_ban', 'Ban a user'), 'Забанить пользователя на сервере');
check('tp() плюрализация', tp('test.commands', 3, { one: 'one command', few: 'few commands', many: 'many commands' }, {}), 'few commands');

console.log('');
console.log(`  Итог: ${passed} успешно, ${failed} проблем`);
console.log('');
process.exit(failed ? 1 : 0);
