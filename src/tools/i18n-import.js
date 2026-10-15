/**
 * Импорт переводов в словарь src/locales/text.<язык>.json.
 *
 * Запуск:  node src/tools/i18n-import.js src/locales/batches/ru-01.txt [ещё файлы...]
 *          node src/tools/i18n-import.js --check           (проверить уже импортированное)
 *
 * Формат файла-батча — одна фраза на строку:
 *     английский текст ||| русский текст
 *
 * Правила:
 *   - \n в ключе означает перевод строки (для многострочных текстов);
 *   - {0}, {1} — подстановки (имя пользователя, число и т.п.), их порядок должен совпадать;
 *   - строки, начинающиеся с # или //, — комментарии;
 *   - ключ сверяется с src/locales/_extracted.json и с исходниками: если такого текста
 *     в боте нет, скрипт сообщает о возможной опечатке.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const LOCALES = path.join(SRC, 'locales');
const EXTRACTED = path.join(LOCALES, '_extracted.json');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const relaxKeys = args.includes('--allow-new') || args.some(arg => arg.startsWith('--out='));
const files = args.filter(arg => !arg.startsWith('--'));

if (!files.length) {
    console.error('Укажите хотя бы один файл-батч: node src/tools/i18n-import.js src/locales/batches/ru-01.txt');
    process.exit(1);
}

const localeArg = (args.find(arg => arg.startsWith('--locale=')) || '').split('=')[1];
const locale = (localeArg || process.env.BOT_LOCALE || 'ru').toLowerCase().split(/[-_]/)[0];
// --out=text.ru.extra.json — для кусков, которых нет в исходниках отдельной строкой
const outArg = (args.find(arg => arg.startsWith('--out=')) || '').split('=')[1];
const DICTIONARY = path.join(LOCALES, outArg || `text.${locale}.json`);

// Что вообще есть в коде — чтобы поймать опечатки в ключах
function loadSourceText() {
    const found = new Map();
    try {
        const extracted = JSON.parse(fs.readFileSync(EXTRACTED, 'utf8'));
        for (const [key, meta] of Object.entries(extracted)) found.set(key, meta.count || 1);
    } catch (_) {}
    return found;
}

const sourceText = loadSourceText();
const known = new Set(sourceText.keys());

function unescapeKey(key) {
    return key.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

const dictionary = (() => {
    try { return JSON.parse(fs.readFileSync(DICTIONARY, 'utf8')); } catch (_) { return {}; }
})();

const added = [];
const updated = [];
const unknown = [];
const duplicates = [];
const seen = new Set();

for (const file of files) {
    const full = path.isAbsolute(file) ? file : path.join(SRC, '..', file);
    if (!fs.existsSync(full)) {
        console.error(`Нет файла: ${file}`);
        process.exit(1);
    }

    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const separator = trimmed.indexOf('|||');
        // комментарий — только строка без пары «ключ ||| перевод»
        if (separator === -1 && (trimmed.startsWith('#') || trimmed.startsWith('//'))) return;

        if (separator === -1) {
            console.error(`${path.basename(file)}:${index + 1}: нет разделителя |||  →  ${trimmed.slice(0, 60)}`);
            return;
        }

        const key = unescapeKey(trimmed.slice(0, separator).trim());
        const value = unescapeKey(trimmed.slice(separator + 3).trim());

        if (!key || !value) {
            console.error(`${path.basename(file)}:${index + 1}: пустой ключ или перевод`);
            return;
        }
        if (/[А-Яа-яЁё]/.test(key)) {
            unknown.push(`[ключ уже на русском] ${key.slice(0, 70)}`);
            return;
        }
        if (seen.has(key)) {
            duplicates.push(key);
            return;
        }
        seen.add(key);

        if (!known.has(key) && !relaxKeys) unknown.push(key);

        if (checkOnly) return;
        if (dictionary[key] === undefined) added.push(key);
        else if (dictionary[key] !== value) updated.push(key);
        dictionary[key] = value;
    });
}

// --prune: убрать из словаря фразы, которых больше нет в коде
let pruned = [];
if (args.includes('--prune')) {
    for (const key of Object.keys(dictionary)) {
        if (known.has(key) || seen.has(key)) continue;
        pruned.push(key);
        delete dictionary[key];
    }
}

if (!checkOnly) {
    fs.writeFileSync(DICTIONARY, JSON.stringify(dictionary, null, 1), 'utf8');
}

const total = Object.keys(dictionary).length;
console.log('');
console.log(`  Язык:            ${locale}`);
console.log(`  Файл словаря:    src/locales/text.${locale}.json`);
console.log(`  Новых фраз:      ${added.length}`);
console.log(`  Обновлённых:     ${updated.length}`);
console.log(`  Всего в словаре: ${total}`);
if (duplicates.length) console.log(`  Дубликатов:      ${duplicates.length} (оставлен последний)`);
if (pruned.length) {
    console.log(`  Удалено лишних:  ${pruned.length}`);
    for (const key of pruned.slice(0, 10)) console.log(`     ${key.slice(0, 100)}`);
}
if (unknown.length) {
    console.log('');
    console.log(`  Не найдено в исходниках (${unknown.length}) — проверьте формулировку:`);
    for (const key of unknown.slice(0, 15)) console.log(`     ${key.slice(0, 100)}`);
    if (unknown.length > 15) console.log(`     … и ещё ${unknown.length - 15}`);
}
console.log('');
