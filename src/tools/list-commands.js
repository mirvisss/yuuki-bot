// Список команд бота. Применяет те же правила отбора файлов, что и src/lib/commandLoader.js,
// поэтому результат совпадает с тем, что реально загружает бот.
// Использование: node src/tools/list-commands.js [prefix|slash|hybrid] [--json] [--by-dir]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const BY_DIR = args.includes('--by-dir');
const TABLE_OUT = args.includes('--table');
const only = (args.find((a) => !a.startsWith('--')) || '').toLowerCase();

// --- копия логики getAllJsFiles из commandLoader ---
function getAllJsFiles(dir, skipSubcommandsDirs = false) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipSubcommandsDirs && entry.name === 'subcommands') continue;
      if (entry.name === 'music') continue;
      files.push(...getAllJsFiles(fullPath, skipSubcommandsDirs));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const str = (src, re) => {
  const m = src.match(re);
  return m ? m[1] : null;
};

// Извлекаем JS-строковый литерал, корректно обрабатывая экранированные кавычки.
// Позволяет не обрезать описания вроде 'Check the bot\'s latency' или "Shows the bot's info".
function extractString(src, idx) {
  const quote = src[idx];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let i = idx + 1;
  let result = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      const next = src[i + 1];
      if (next === 'n') result += '\n';
      else if (next === 't') result += '\t';
      else if (next === 'r') result += '\r';
      else result += next; // \' -> ', \" -> ", \\ -> \
      i += 2;
    } else if (ch === quote) {
      return result;
    } else {
      result += ch;
      i++;
    }
  }
  return null;
}

// Ищем описание: description: "..." или .setDescription("..." ), возвращая распарсенное значение.
function descOf(src, re) {
  const m = src.match(re);
  if (!m) return null;
  const quoteIdx = m.index + m[0].length - 1; // шаг назад к открывающей кавычке
  return extractString(src, quoteIdx);
};

function parse(file) {
  const src = fs.readFileSync(file, 'utf8');

  // Имя команды берём из блока module.exports (верхний уровень), а не из
  // внутренних { name: 'x', value: 'x' } выпадающих списков.
  const expIdx = src.indexOf('module.exports');
  const exp = expIdx >= 0 ? src.slice(expIdx) : '';
  // Пробелы разрешены: часть префиксных команд называется "pfp anime" и т.п.
  let name = str(exp, /^[ \t]{0,4}name:[ \t]*['"`]([^'"`]+)['"`]/m);

  // Для слэш-команд имя задаётся .setName() до первого .addSubcommand()
  const head = src.split('.addSubcommand')[0];
  let slashName = str(head, /\.setName\([ \t]*['"`]([a-z0-9_.\-]+)['"`]/);

  let desc =
    descOf(exp, /^[ \t]{0,4}description:[ \t]*['"`]/m) ||
    descOf(head, /\.setDescription\([ \t]*['"`]/) ||
    '';

  const am = exp.match(/aliases:[ \t]*\[([^\]]*)\]/);
  const aliases = am ? [...am[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]) : [];

  return {
    name: name || slashName,
    prefixName: name,
    slashName,
    desc,
    aliases,
    hasExecute: /\bexecute[ \t]*[(:]/.test(src),
    file: path.relative(ROOT, file).split(path.sep).join('/'),
  };
}

function collect(relBase, label, mode) {
  const base = path.join(ROOT, relBase);
  const rows = [];
  let rejected = 0;

  if (mode === 'slash') {
    for (const file of getAllJsFiles(base, true)) {
      const c = parse(file);
      if (c.slashName && c.hasExecute) rows.push(c);
      else rejected++;
    }
  } else if (mode === 'prefix') {
    for (const file of getAllJsFiles(base, false)) {
      const parts = path.relative(base, file).split(path.sep);
      if (parts.length > 2) continue;
      if (parts.length === 2) {
        const [dirName, fileName] = parts;
        const main = path.join(base, dirName, `${dirName}.js`);
        if (fs.existsSync(main) && fileName.replace('.js', '') !== dirName) continue;
      }
      const c = parse(file);
      if (c.prefixName && c.hasExecute) rows.push(c);
      else rejected++;
    }
  } else {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const main = path.join(base, entry.name, `${entry.name}.js`);
      if (!fs.existsSync(main)) continue;
      const c = parse(main);
      if (c.slashName) rows.push(c);
      else rejected++;
    }
  }

  rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  if (BY_DIR && !TABLE_OUT) {
    const by = {};
    for (const r of rows) {
      const m = r.file.match(new RegExp(`^${relBase}/([^/]+)/`));
      const key = m ? m[1] : '(в корне)';
      (by[key] ||= []).push(r);
    }
    console.log(`\n### ${label} — ${rows.length}, по папкам`);
    for (const [k, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${String(list.length).padStart(4)}  ${k.padEnd(16)} ${list.map((r) => r.name).join(', ')}`);
    }
    if (rejected) console.log(`  отброшено файлов: ${rejected}`);
    return rows;
  }

  if (!JSON_OUT && !TABLE_OUT) {
    console.log(`\n### ${label} — ${rows.length}`);
    for (const r of rows) {
      const al = r.aliases.length ? `  [${r.aliases.join(', ')}]` : '';
      const both = r.prefixName && r.slashName && r.prefixName !== r.slashName
        ? `  (префикс: ${r.prefixName})`
        : '';
      console.log(`${String(r.name).padEnd(18)} ${r.desc}${al}${both}`);
    }
    if (rejected) console.log(`  отброшено файлов без корректного имени/execute: ${rejected}`);
  }
  return rows;
}

const out = {};
if (!only || only === 'prefix') out.prefix = collect('src/commands/prefix', 'PREFIX — команды с префиксом', 'prefix');
if (!only || only === 'slash') out.slash = collect('src/commands/slash', 'SLASH — слэш-команды', 'slash');
if (!only || only === 'hybrid') out.hybrid = collect('src/hybrid', 'HYBRID — работают и как префикс, и как слэш', 'hybrid');

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else if (TABLE_OUT) {
  const pad = (s, n) => String(s).padEnd(n);
  const escMd = (s) => String(s || '').replace(/\|[`*_{}\[\]()#<>+=!~]/g, '').replace(/\n/g, ' ');
  const labels = { prefix: 'PREFIX', slash: 'SLASH', hybrid: 'HYBRID' };
  const titles = { prefix: 'Префиксные команды', slash: 'Слэш-команды', hybrid: 'Гибридные команды (работают и как префикс, и как слэш)' };
  const order = ['prefix', 'slash', 'hybrid'];
  for (const key of order) {
    if (!out[key]) continue;
    const rows = out[key];
    console.log(`\n## ${titles[key]} (${rows.length})\n`);
    if (key === 'slash') {
      console.log('| Команда | Описание | Файл |');
      console.log('| --- | --- | --- |');
      for (const r of rows) console.log(`| ${r.slashName} | ${escMd(r.desc)} | ${r.file} |`);
    } else {
      console.log('| Команда | Описание | Алиасы | Файл |');
      console.log('| --- | --- | --- | --- |');
      for (const r of rows) {
        const al = r.aliases.length ? r.aliases.join(', ') : '—';
        console.log(`| ${r.name} | ${escMd(r.desc)} | ${al} | ${r.file} |`);
      }
    }
  }
} else {
  const total = Object.values(out).reduce((n, r) => n + r.length, 0);
  const prefixNames = Object.values(out).reduce((n, r) => n + r.reduce((k, c) => k + 1 + c.aliases.length, 0), 0);
  const slashTotal = (out.slash?.length || 0) + (out.hybrid?.length || 0);
  console.log(`\nМодулей команд всего: ${total}`);
  console.log(`Префиксных имён (с алиасами): ${prefixNames}`);
  console.log(`Слэш-команд (slash + hybrid): ${slashTotal}`);
}