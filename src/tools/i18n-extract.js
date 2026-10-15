/**
 * Извлекает пользовательские английские строки из кода и складывает их
 * в src/locales/_extracted.json (ключ = строка, значение = сколько раз встречается).
 *
 * Запуск:  node src/tools/i18n-extract.js
 *
 * Строки берутся только из мест, которые реально показываются людям:
 *   setContent(...), setDescription(...), setTitle(...), setLabel(...),
 *   setPlaceholder(...), content:, description:, label:, placeholder:, title:,
 *   текст внутри setFooter({ text: ... }) и setAuthor({ name: ... }).
 *
 * Внутри шаблонных строк подстановки заменяются на {0}, {1}, ... — та же схема,
 * что и у runtime-переводчика (src/lib/autoTranslate.js).
 */

const fs = require('fs');
const path = require('path');
const { patternize } = require('../lib/autoTranslate');

const SRC = path.join(__dirname, '..');
const OUT = path.join(SRC, 'locales', '_extracted.json');
const SKIP_DIRS = new Set(['locales', 'tools', 'assets', 'static', 'logs', 'node_modules']);

// Контекст, при котором строку считаем пользовательским текстом
const UI_CONTEXT = /(?:setContent|setDescription|setTitle|setLabel|setPlaceholder|setName|setFields|addFields|setFooter|setAuthor|setText|content|description|label|placeholder|title|text)\s*[:(]\s*$/;

/** Разэкранирование JS-последовательностей — чтобы ключ совпадал с реальным текстом. */
function escapeChar(char) {
    switch (char) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case '0': return '\0';
        case 'b': return '';
        default: return char ?? '';
    }
}

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

/** Простой сканер JS: находит строковые литералы и текст контекста перед ними. */
function scanLiterals(code) {
    const found = [];
    let context = '';

    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const next = code[i + 1];

        // комментарии и строки пропускаем как «шум», но помним последний полезный контекст
        if (char === '/' && next === '/') {
            while (i < code.length && code[i] !== '\n') i++;
            continue;
        }
        if (char === '/' && next === '*') {
            i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
            i++;
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            let raw = '';
            let isTemplate = quote === '`';
            let parts = 0;
            i++;

            while (i < code.length) {
                const c = code[i];
                if (c === '\\') { raw += escapeChar(code[i + 1]); i += 2; continue; }
                if (c === quote) break;
                if (isTemplate && c === '$' && code[i + 1] === '{') {
                    // пропускаем выражение внутри ${ ... } с учётом вложенности
                    let depth = 1;
                    i += 2;
                    while (i < code.length && depth > 0) {
                        if (code[i] === '{') depth++;
                        else if (code[i] === '}') depth--;
                        else if (code[i] === '\\') { i++; }
                        else if (code[i] === quote) { // вложенная строка
                            const inner = code[i];
                            i++;
                            while (i < code.length && code[i] !== inner) { if (code[i] === '\\') i++; i++; }
                        }
                        i++;
                    }
                    raw += `\u0000${parts}\u0000`;
                    parts++;
                    continue;
                }
                raw += c;
                i++;
            }

            const literalText = raw;
            found.push({ text: literalText, context: context.slice(-60), isTemplate, parts });
            context = '';
            continue;
        }

        context += char;
        if (context.length > 200) context = context.slice(-120);
    }

    return found;
}

function looksTranslatable(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 2) return false;
    // уже переведено / интерполяции-заглушки и служебные строки
    if (/[\u0400-\u04FF]/.test(trimmed)) return false;
    if (/^[a-z0-9_.\-/]+$/i.test(trimmed)) return false;      // require-пути, id, ключи, 'utf8'
    if (/^(?:https?:|\/|[.#@]{0,1}[\w-]+\.js)/.test(trimmed)) return false;
    if (trimmed.startsWith('http')) return false;
    if (/^[\d\s:.,\-+%]+$/.test(trimmed)) return false;
    return /[A-Za-z]/.test(trimmed);
}

const counts = new Map();
const perContext = new Map();

for (const file of walk(SRC)) {
    let code;
    try { code = fs.readFileSync(file, 'utf8'); } catch { continue; }

    for (const literal of scanLiterals(code)) {
        if (!UI_CONTEXT.test(literal.context)) continue;
        if (!looksTranslatable(literal.text)) continue;

        const key = patternize(literal.text);
        const entry = counts.get(key) || { count: 0, file, hasPlaceholders: literal.isTemplate };
        entry.count++;
        counts.set(key, entry);

        const ctx = (literal.context.match(/([A-Za-z]+)\s*[:(]\s*$/) || [, '?'])[1];
        perContext.set(ctx, (perContext.get(ctx) || 0) + 1);
    }
}

const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
const payload = {};
for (const [key, meta] of sorted) payload[key] = meta;

fs.writeFileSync(OUT, JSON.stringify(payload, null, 1), 'utf8');

const unique = sorted.length;
const total = sorted.reduce((sum, [, meta]) => sum + meta.count, 0);
const withVars = sorted.filter(([key]) => /\{\d+\}/.test(key)).length;

console.log('');
console.log(`  Уникальных строк:      ${unique}`);
console.log(`  Всего вхождений:       ${total}`);
console.log(`  Со подстановками:      ${withVars}`);
console.log(`  Файл:                  src/locales/_extracted.json`);
console.log('');
console.log('  По контексту:');
for (const [ctx, n] of [...perContext].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(5)}  ${ctx}`);
}
console.log('');
console.log('  Топ-20 самых частых:');
for (const [key, meta] of sorted.slice(0, 20)) {
    console.log(`     ${String(meta.count).padStart(4)}x  ${key.length > 90 ? key.slice(0, 90) + '…' : key}`);
}
console.log('');
