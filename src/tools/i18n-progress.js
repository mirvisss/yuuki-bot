/**
 * Отчёт о прогрессе перевода.
 *
 * Запуск:  node src/tools/i18n-progress.js
 *
 * Файл считается локализованным, если в нём есть пользовательский текст
 * (setContent / setDescription / content:) И подключён src/lib/i18n.
 * Английские строки в коде остаются запасным вариантом, поэтому перевод
 * можно добавлять постепенно — отчёт показывает, где ещё не начато.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const USER_TEXT = /setContent\(|setDescription\(|content: *['"`]/g;
const I18N = /lib\/i18n/;
const SKIP_DIRS = new Set(['locales', 'tools', 'assets', 'static', 'logs']);

function walk(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name) || entry.name === 'node_modules') continue;
            walk(full, files);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(full);
        }
    }
    return files;
}

const localized = new Set();
const pending = [];

for (const file of walk(SRC)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }

    const textCount = (text.match(USER_TEXT) || []).length;
    if (!textCount) continue;

    const relative = path.relative(SRC, file).replace(/\\/g, '/');
    if (I18N.test(text)) localized.add(relative);
    else pending.push({ file: relative, textCount });
}

let keys = 0;
try { keys = Object.keys(JSON.parse(fs.readFileSync(path.join(SRC, 'locales', 'ru.json'), 'utf8'))).length; } catch (_) {}

const total = localized.size + pending.length;
const percent = total ? Math.floor((localized.size / total) * 100) : 100;

// --- Покрытие словаря text.ru.json (runtime-перевод исходящего текста) ---
const dictionary = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(SRC, 'locales', 'text.ru.json'), 'utf8')); } catch (_) { return {}; }
})();
const phrases = Object.keys(dictionary).length;

const extracted = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(SRC, 'locales', '_extracted.json'), 'utf8')); } catch (_) { return null; }
})();

let coverage = null;
if (extracted) {
    const entries = Object.entries(extracted);
    const translatable = entries.filter(([key]) => /[A-Za-z]/.test(key.replace(/\{\d+\}/g, '').replace(/\\n|\\t/g, '')));
    const done = translatable.filter(([key]) => dictionary[key] !== undefined);
    const sum = list => list.reduce((acc, [, meta]) => acc + (meta.count || 0), 0);
    coverage = {
        uniqueTotal: translatable.length,
        uniqueDone: done.length,
        hitsTotal: sum(translatable),
        hitsDone: sum(done),
        rest: translatable.filter(([key]) => dictionary[key] === undefined)
    };
}

console.log('');
console.log(`  Фраз в словаре:      ${phrases}   (src/locales/text.ru.json — перевод исходящего текста)`);
if (coverage) {
    const uniquePercent = coverage.uniqueTotal ? Math.round((coverage.uniqueDone / coverage.uniqueTotal) * 100) : 100;
    const hitsPercent = coverage.hitsTotal ? Math.round((coverage.hitsDone / coverage.hitsTotal) * 100) : 100;
    console.log(`  Покрытие словаря:    ${coverage.uniqueDone}/${coverage.uniqueTotal} фраз (${uniquePercent}%)`);
    console.log(`  По встречаемости:    ${coverage.hitsDone}/${coverage.hitsTotal} (${hitsPercent}% всех показов текста)`);
}
console.log(`  Ключей в ru.json:    ${keys}   (src/lib/i18n.js — точечный перевод отдельных файлов)`);
console.log(`  Файлов с текстом:    ${total}`);
console.log(`  Переведено вручную:  ${localized.size} (${percent}%)`);
console.log('');
console.log('  По директориям (локализовано / всего):');

const groups = new Map();
for (const file of [...localized, ...pending.map(p => p.file)]) {
    const group = path.dirname(file);
    if (!groups.has(group)) groups.set(group, { done: 0, total: 0 });
    const entry = groups.get(group);
    entry.total++;
    if (localized.has(file)) entry.done++;
}

for (const [group, { done, total: groupTotal }] of [...groups].sort((a, b) => (b[1].total - b[1].done) - (a[1].total - a[1].done))) {
    const mark = done === groupTotal ? '✓' : ' ';
    console.log(`   ${mark} ${String(done).padStart(3)} / ${String(groupTotal).padEnd(3)}  ${group}`);
}

if (coverage && coverage.rest.length) {
    console.log('');
    console.log('  Ещё не в словаре — самые частые:');
    for (const [key, meta] of coverage.rest.sort((a, b) => b[1].count - a[1].count).slice(0, 12)) {
        console.log(`     ${String(meta.count).padStart(3)}x  ${key.length > 80 ? key.slice(0, 80) + '…' : key}`);
    }
}

if (pending.length) {
    console.log('');
    console.log('  Файлы, где перевод ещё не подключён вручную (не обязательно — работает словарь):');
    for (const { file, textCount } of pending.sort((a, b) => b.textCount - a.textCount).slice(0, 6)) {
        console.log(`     ${String(textCount).padStart(3)} строк   ${file}`);
    }
}
console.log('');
