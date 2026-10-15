/**
 * Локализация Yuuki.
 *
 * Как это устроено:
 *  - переводы лежат в src/locales/<язык>.json, ключи плоские: "help.title", "cmd.ban";
 *  - английские строки остаются прямо в коде и передаются вторым аргументом как запасной вариант;
 *  - если перевода нет, показывается английский текст — ничего не ломается,
 *    поэтому перевод можно добавлять постепенно, файл за файлом.
 *
 * Использование:
 *    const { t, tp, slug } = require('../../lib/i18n');
 *    t('cmd.ban', 'Ban a user')                     // -> "Забанить пользователя"
 *    t('help.page', 'Page {page}/{total}', { page: 1, total: 3 })
 *    tp('remind.in', 5, { one: 'через {count} минуту', few: 'через {count} минуты', many: 'через {count} минут' }, { count: 5 })
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const RUSSIAN_PLURAL = 'ru';

let fallbackLocale = 'en';
let activeLocale = null;

const cache = new Map();

function normalizeLocale(locale) {
    return String(locale || '').trim().toLowerCase().split(/[-_]/)[0];
}

function readLocaleFile(locale) {
    try {
        const raw = fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[i18n] Не удалось прочитать locale "${locale}": ${error.message}`);
        }
        return {};
    }
}

function localeData(locale) {
    const key = normalizeLocale(locale);
    if (!cache.has(key)) cache.set(key, readLocaleFile(key));
    return cache.get(key);
}

function getLocale() {
    if (activeLocale) return activeLocale;
    let configured = process.env.BOT_LOCALE;
    if (!configured) {
        try {
            configured = require('../config').LOCALE;
        } catch (_) {
            configured = null;
        }
    }
    activeLocale = normalizeLocale(configured) || 'ru';
    return activeLocale;
}

function setLocale(locale) {
    activeLocale = normalizeLocale(locale) || null;
    return getLocale();
}

function lookup(locale, key) {
    if (!key) return undefined;
    const data = localeData(locale);
    if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];

    // поддержка вложенных ключей: "help.menu.title" -> { help: { menu: { title: ... } } }
    const parts = String(key).split('.');
    let node = data;
    for (const part of parts) {
        if (node && typeof node === 'object' && part in node) node = node[part];
        else return undefined;
    }
    return typeof node === 'object' ? undefined : node;
}

function interpolate(template, vars) {
    if (template == null) return template;
    const text = String(template);
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
}

/** Правила множественного числа для русского: 1 минута / 2 минуты / 5 минут */
function pluralForm(locale, count) {
    const n = Math.abs(Number(count) || 0);
    if (normalizeLocale(locale) === RUSSIAN_PLURAL || normalizeLocale(locale) === 'uk' || normalizeLocale(locale) === 'be') {
        const tail10 = n % 10;
        const tail100 = n % 100;
        if (tail10 === 1 && tail100 !== 11) return 'one';
        if (tail10 >= 2 && tail10 <= 4 && (tail100 < 12 || tail100 > 14)) return 'few';
        return 'many';
    }
    return n === 1 ? 'one' : 'other';
}

function pickPlural(forms, locale, count) {
    if (!forms || typeof forms !== 'object') return forms;
    const form = pluralForm(locale, count);
    return forms[form] ?? forms.other ?? forms.many ?? forms.one ?? forms.few;
}

/**
 * Основная функция перевода.
 * @param {string} key      ключ в locale-файле
 * @param {string|object}   fallback английский текст (либо объект с формами для плюрализации)
 * @param {object}          vars подстановки вида { name: 'значение' }
 */
function t(key, fallback, vars) {
    const locale = getLocale();
    let value = lookup(locale, key);
    if (value === undefined) value = lookup(fallbackLocale, key);

    const expectsPlural = fallback && typeof fallback === 'object';

    if (value === undefined) {
        if (expectsPlural) return interpolate(pickPlural(fallback, locale, vars?.count), vars);
        return fallback === undefined ? key : interpolate(fallback, vars);
    }

    if (typeof value === 'object') return interpolate(pickPlural(value, locale, vars?.count), vars);
    return interpolate(value, vars);
}

/** Явная плюрализация: tp(key, count, { one, few, many, other }, vars) */
function tp(key, count, forms, vars = {}) {
    return t(key, forms, { ...vars, count });
}

function has(key, locale = null) {
    return lookup(locale || getLocale(), key) !== undefined;
}

/** Сколько ключей переведено — для отчёта о прогрессе */
function stats(locale = null) {
    const target = normalizeLocale(locale || getLocale());
    const translated = Object.keys(localeData(target)).length;
    return { locale: target, keys: translated };
}

function reload() {
    cache.clear();
    activeLocale = null;
    return stats();
}

/** 'list boosters' -> 'list_boosters', 'avatar [user]' -> 'avatar', 'stats rolecall' -> 'stats_rolecall' */
function slug(text) {
    return String(text || '')
        .replace(/[<[(][^>\])]*[>\])]/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

module.exports = { t, tp, has, slug, setLocale, getLocale, pluralForm, stats, reload, LOCALES_DIR };
