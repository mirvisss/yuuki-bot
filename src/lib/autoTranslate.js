/**
 * Автоматический перевод исходящего текста.
 *
 * Зачем: в проекте ~500 файлов с английскими строками прямо в коде. Чтобы не
 * переписывать каждый вручную, перевод ставится «на выходе»: перед отправкой
 * сообщения в Discord текст ищется в словаре src/locales/text.<язык>.json.
 *
 * Как это работает:
 *   1. точное совпадение:  "Buttons are disabled"        -> "Кнопки отключены";
 *   2. совпадение по шаблону: строка обезличивается —
 *      "Banned **mirviss** for 3 days" -> "Banned {0} for {1} days";
 *   3. многострочные тексты переводятся построчно;
 *   4. если совпадения нет — строка уходит как есть (английский), ничего не ломается.
 *
 * Выключается переменной окружения BOT_LOCALE (например, BOT_LOCALE=en).
 *
 * Новые файлы по-прежнему можно переводить «по-человечески» через src/lib/i18n
 * (ключи вида cmd.ban) — оба механизма работают одновременно и не мешают друг другу:
 * уже переведённый русский текст в словаре просто не находится.
 */

const fs = require('fs');
const path = require('path');
const { getLocale, LOCALES_DIR } = require('./i18n');

const DICTIONARY_PREFIX = 'text.';
// Поля объектов, в которых лежит текст для людей
const TRANSLATABLE_KEYS = new Set([
    'content', 'description', 'title', 'label', 'placeholder', 'text', 'name', 'value'
]);

const dictionaries = new Map();

/* ------------------------------------------------------------------ *
 *  Обезличивание строк: значения подстановок -> {0}, {1}, {2} ...
 * ------------------------------------------------------------------ */

// Один проход, поэтому вложенные значения (цифры внутри **жирного**) не разъезжаются.
const MASK_RULES = [
    /\u0000\d+\u0000/g,                    // подстановка ${...} из шаблонной строки (только для extract)
    /<a?:\w+:\d+>/g,                       // кастомный эмодзи
    /<@!?\d+>/g,                           // упоминание пользователя
    /<@&\d+>/g,                            // упоминание роли
    /<#\d+>/g,                             // упоминание канала
    /<t:\d+(?::[tTdDfFR])?>/g,             // метка времени
    /https?:\/\/\S+/g,                     // ссылка
    /`[^`\n]+`/g,                          // код в одну строку
    /\*\*[^*\n]+\*\*/g,                    // жирный текст (часто имя пользователя)
    /\b\d+(?:[.,:]\d+)*\b/g                // числа, версии, ID
];
const MASK_REGEX = new RegExp(MASK_RULES.map(r => r.source).join('|'), 'g');

/** Возвращает { pattern, tokens }: pattern — обезличенный вид, tokens — что подставлялось. */
function maskWithTokens(text) {
    const tokens = [];
    const pattern = String(text).replace(MASK_REGEX, (match) => `{${tokens.push(match) - 1}}`);
    return { pattern, tokens };
}

/** Обезличенный вид строки — используется в инструментах и в словаре. */
function patternize(text) {
    return maskWithTokens(text).pattern;
}

/**
 * Подставляет оригинальные значения обратно в перевод: "Забанен {0} на {1}".
 * Сами вставки тоже прогоняются через словарь — так переводятся куски,
 * которые код передаёт в шаблон как значение (например **Usage:**).
 */
function fillTokens(translation, tokens, depth = 0) {
    if (!Array.isArray(tokens) || !tokens.length) return String(translation);
    return String(translation).replace(/\{(\d+)\}/g, (match, index) => {
        const token = tokens[Number(index)];
        if (token === undefined) return match;
        if (depth >= 3 || typeof token !== 'string' || !token) return token;
        return translateText(token, dictionary(), depth + 1);
    });
}

/* ------------------------------------------------------------------ *
 *  Словари
 * ------------------------------------------------------------------ */

function normalizeLocale(locale) {
    return String(locale || '').trim().toLowerCase().split(/[-_]/)[0] || 'ru';
}

function readDictionaryFile(file) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error(`[i18n] Не удалось прочитать словарь ${path.basename(file)}: ${error.message}`);
        return {};
    }
}

/** Словарь = text.<locale>.json + необязательный text.<locale>.extra.json (для правок без пересборки). */
function dictionary(locale = null) {
    const key = normalizeLocale(locale || getLocale());
    if (dictionaries.has(key)) return dictionaries.get(key);

    const words = new Map();
    for (const name of [`${DICTIONARY_PREFIX}${key}.json`, `${DICTIONARY_PREFIX}${key}.extra.json`]) {
        const file = path.join(LOCALES_DIR, name);
        if (!fs.existsSync(file)) continue;
        for (const [source, translation] of Object.entries(readDictionaryFile(file))) {
            if (typeof translation === 'string' && translation.trim()) words.set(source, translation);
        }
    }

    dictionaries.set(key, words);
    return words;
}

function reload() {
    dictionaries.clear();
}

/* ------------------------------------------------------------------ *
 *  Сбор фраз, которые не нашлись в словаре (реальная работа бота)
 * ------------------------------------------------------------------ */

const MISS_FILE = path.join(LOCALES_DIR, '..', 'logs', 'i18n-misses.json');
const misses = new Map();
let missTimer = null;

function looksLikeUserText(text) {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (trimmed.length < 3 || trimmed.length > 300) return false;
    if (/[\u0400-\u04FF]/.test(trimmed)) return false;              // уже русский
    if (!/[A-Za-z]/.test(trimmed.replace(/\\n|\\t/g, ''))) return false;
    if (/^(?:https?:\/\/|\d|@|#)/.test(trimmed)) return false;
    return true;
}

function recordMiss(text) {
    if (!looksLikeUserText(text)) return;
    const { pattern, tokens } = maskWithTokens(text);
    if (!/[A-Za-z]/.test(pattern.replace(/\{\d+\}/g, '').replace(/\\n|\\t/g, ''))) return;
    const saved = tokens.length ? pattern : text;
    misses.set(saved, (misses.get(saved) || 0) + 1);
}

/** Сохраняет собранные фразы на диск (вызывается по таймеру и на выходе). */
function flushMisses() {
    if (!misses.size) return 0;

    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(MISS_FILE, 'utf8')); } catch (_) {}

    for (const [key, count] of misses) existing[key] = (existing[key] || 0) + count;
    misses.clear();

    const entries = Object.entries(existing).sort((a, b) => b[1] - a[1]);
    const trimmed = Object.fromEntries(entries.slice(0, 3000));

    try {
        fs.mkdirSync(path.dirname(MISS_FILE), { recursive: true });
        fs.writeFileSync(MISS_FILE, JSON.stringify(trimmed, null, 1), 'utf8');
        return entries.length;
    } catch (error) {
        return 0;
    }
}

/** Включает сбор: раз в минуту и при остановке бота список пишется в src/logs/i18n-misses.json */
function startMissCollector(intervalMs = 60000) {
    if (missTimer) return false;
    missTimer = setInterval(flushMisses, intervalMs);
    missTimer.unref?.();
    for (const signal of ['exit', 'SIGINT', 'SIGTERM']) {
        process.once(signal, () => { flushMisses(); if (signal !== 'exit') process.exit(0); });
    }
    return true;
}

/** Сколько фраз в словаре — для отчёта о прогрессе. */
function stats(locale = null) {
    return { locale: normalizeLocale(locale || getLocale()), phrases: dictionary(locale).size };
}

/* ------------------------------------------------------------------ *
 *  Перевод строки
 * ------------------------------------------------------------------ */

// Обёртки Discord-разметки: заголовок, подтекст, цитата, код, жирный/подчеркнутый.
// Их снимаем и переводим внутренний текст — иначе «**Ошибка**» осталась бы английской,
// потому что маскировка скрывает содержимое жирного текста.
const MARKDOWN_WRAPPERS = [
    ['**', '**'], ['__', '__'], ['`', '`'], ['*', '*'], ['_', '_'],
    ['### ', ''], ['## ', ''], ['# ', ''], ['-# ', ''], ['> ', '']
];

function splitWrapper(text) {
    for (const [prefix, suffix] of MARKDOWN_WRAPPERS) {
        if (text.length <= prefix.length + suffix.length) continue;
        if (!text.startsWith(prefix)) continue;
        if (suffix && !text.endsWith(suffix)) continue;
        const inner = text.slice(prefix.length, text.length - suffix.length).trim();
        if (!inner || !/[A-Za-z\u0400-\u04FF]/.test(inner)) continue;
        return { prefix, suffix, inner, leading: text.slice(0, prefix.length), trailing: suffix ? text.slice(text.length - suffix.length) : '' };
    }
    return null;
}

function lookup(words, text) {
    if (!text) return undefined;

    const { pattern, tokens } = maskWithTokens(text);

    const direct = words.get(text);
    if (direct !== undefined) return { translation: direct, tokens };

    // Шаблон из одних подстановок («{0}») ничего не переводит — он может только
    // «съесть» строку целиком (жирный текст, код), поэтому его пропускаем.
    const placeholderOnly = pattern.replace(/\{\d+\}/g, '').trim() === '';
    const byPattern = pattern !== text && !placeholderOnly ? words.get(pattern) : undefined;
    if (byPattern !== undefined) return { translation: byPattern, tokens };

    return undefined;
}

/**
 * Переводит одну строку. Многострочный текст переводится построчно —
 * так переводятся списки и описания embed'ов.
 */
function translateText(text, words = dictionary(), depth = 0) {
    if (typeof text !== 'string' || !text || depth > 4) return text;
    const trimmed = text.trim();
    if (!trimmed || words.size === 0) return text;

    const whole = lookup(words, text);
    if (whole) return fillTokens(whole.translation, whole.tokens, depth);

    if (!text.includes('\n')) {
        // «**Ошибка**», «### Настройки», «> цитата», «`код`» — переводим содержимое
        const wrapped = splitWrapper(trimmed);
        if (wrapped) {
            const inner = translateText(wrapped.inner, words, depth + 1);
            if (inner !== wrapped.inner) {
                return text.replace(trimmed, () => `${wrapped.leading}${inner}${wrapped.trailing}`);
            }
        }

        // Несколько предложений в одной строке: «Failed to lock channel. Please try again later.»
        const sentences = trimmed.split(/(?<=[.!?…])\s+/);
        if (sentences.length > 1) {
            let changed = false;
            const parts = sentences.map((sentence) => {
                const direct = lookup(words, sentence);
                if (direct) {
                    changed = true;
                    return fillTokens(direct.translation, direct.tokens, depth);
                }
                const translatedSentence = translateText(sentence, words, depth + 1);
                if (translatedSentence !== sentence) changed = true;
                return translatedSentence;
            });
            if (changed) return text.replace(trimmed, () => parts.join(' '));
        }

        recordMiss(text);
        return text;
    }

    let changed = false;
    const lines = text.split('\n').map((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return line;

        const direct = lookup(words, line);
        if (direct) {
            changed = true;
            return fillTokens(direct.translation, direct.tokens, depth);
        }

        // строку с отступами (списки, цитаты) переводим отдельно от отступа
        if (trimmedLine !== line) {
            const inner = lookup(words, trimmedLine);
            if (inner) {
                changed = true;
                return line.replace(trimmedLine, () => fillTokens(inner.translation, inner.tokens, depth));
            }
        }

        recordMiss(trimmedLine);
        return line;
    });

    return changed ? lines.join('\n') : text;
}

/* ------------------------------------------------------------------ *
 *  Обработка объектов и установка хуков
 * ------------------------------------------------------------------ */

/**
 * Перевод описаний слэш-команд перед регистрацией в Discord.
 * Имена команд остаются латиницей (требование Discord), переводятся только описания.
 */
function translateApplicationCommand(command) {
    if (!command || typeof command !== 'object') return command;

    const translated = { ...command };
    if (typeof translated.description === 'string') translated.description = translateText(translated.description);
    if (Array.isArray(translated.options)) translated.options = translated.options.map(translateApplicationCommand);

    // значения вариантов автодополнения не трогаем — только подписи
    if (Array.isArray(translated.choices)) {
        translated.choices = translated.choices.map(choice =>
            choice && typeof choice.name === 'string'
                ? { ...choice, name: translateText(choice.name) }
                : choice
        );
    }

    return translated;
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** Рекурсивно переводит строки полезной нагрузки сообщения (content, embeds, components, modal). */
function translatePayload(node, depth = 0) {
    if (depth > 8 || node == null) return node;
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) node[i] = translatePayload(node[i], depth + 1);
        return node;
    }
    if (!isPlainObject(node)) return node;

    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string') {
            if (TRANSLATABLE_KEYS.has(key)) node[key] = translateText(value);
        } else if (value && typeof value === 'object') {
            node[key] = translatePayload(value, depth + 1);
        }
    }
    return node;
}

function translateArg(arg) {
    if (typeof arg === 'string') return translateText(arg);
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        try { return translatePayload(arg); } catch { return arg; }
    }
    return arg;
}

const wrapped = new Set();

function wrapMethod(target, method) {
    if (!target || typeof target[method] !== 'function') return false;
    const original = target[method];
    if (original.__i18nWrapped) return true;

    function wrappedMethod(...args) {
        try {
            return original.apply(this, args.map(translateArg));
        } catch (error) {
            /* ниже повтор без перевода — сообщение всё равно должно уйти */
            console.error(`[i18n] Сбой перевода в ${method}: ${error.message}`);
            return original.apply(this, args);
        }
    }
    wrappedMethod.__i18nWrapped = true;
    target[method] = wrappedMethod;
    wrapped.add(method);
    return true;
}

/** Устанавливает перевод на все места, откуда текст уходит в Discord. */
function install() {
    const locale = normalizeLocale(getLocale());
    if (locale === 'en') return false;

    let discord;
    try {
        discord = require('discord.js');
    } catch (error) {
        console.error(`[i18n] discord.js не найден: ${error.message}`);
        return false;
    }

    // 1. Embed'ы и компоненты: текст задаётся через сеттеры
    const builderTargets = [
        [discord.EmbedBuilder.prototype, ['setDescription', 'setTitle']],
        [discord.EmbedBuilder.prototype, ['setFooter', 'setAuthor']],
        [discord.EmbedBuilder.prototype, ['setFields', 'addFields']],
        [discord.TextDisplayBuilder?.prototype, ['setContent']],
        [discord.ButtonBuilder?.prototype, ['setLabel']],
        [discord.StringSelectMenuBuilder?.prototype, ['setPlaceholder']],
        [discord.StringSelectMenuOptionBuilder?.prototype, ['setLabel', 'setDescription']],
        [discord.UserSelectMenuBuilder?.prototype, ['setPlaceholder']],
        [discord.RoleSelectMenuBuilder?.prototype, ['setPlaceholder']],
        [discord.ChannelSelectMenuBuilder?.prototype, ['setPlaceholder']],
        [discord.MentionableSelectMenuBuilder?.prototype, ['setPlaceholder']],
        [discord.ModalBuilder?.prototype, ['setTitle']],
        [discord.TextInputBuilder?.prototype, ['setLabel', 'setPlaceholder']],
        [discord.SectionBuilder?.prototype, []]
    ];
    for (const [target, methods] of builderTargets) {
        for (const method of methods) wrapMethod(target, method);
    }

    // 2. Ответы на взаимодействия: /команды, кнопки, меню, модальные окна, автодополнение.
    //    В discord.js нет класса Interaction — методы reply/editReply/followUp/update живут
    //    на конкретных классах (CommandInteraction, MessageComponentInteraction и т.д.),
    //    поэтому перечисляем их явно. Без этого ответы на слэш-команды и ephemeral-сообщения
    //    уходили бы по-английски.
    const interactionTargets = [
        'BaseInteraction', 'CommandInteraction', 'ChatInputCommandInteraction',
        'ContextMenuCommandInteraction', 'MessageContextMenuCommandInteraction',
        'UserContextMenuCommandInteraction', 'PrimaryEntryPointCommandInteraction',
        'MessageComponentInteraction', 'ButtonInteraction', 'SelectMenuInteraction',
        'StringSelectMenuInteraction', 'UserSelectMenuInteraction', 'RoleSelectMenuInteraction',
        'ChannelSelectMenuInteraction', 'MentionableSelectMenuInteraction',
        'ModalSubmitInteraction', 'AutocompleteInteraction',
        'InteractionResponse', 'InteractionWebhook'
    ];
    const interactionMethods = ['reply', 'editReply', 'followUp', 'update', 'showModal', 'respond',
                                'create', 'edit', 'send', 'editMessage'];
    let interactionHooks = 0;
    for (const name of interactionTargets) {
        const target = discord[name]?.prototype;
        if (!target) continue;
        for (const method of interactionMethods) {
            if (wrapMethod(target, method)) interactionHooks++;
        }
    }
    if (interactionHooks === 0) {
        console.error('[i18n] Не удалось перехватить ответы на взаимодействия — проверьте версию discord.js');
    }

    // 3. Обычные сообщения: префиксные команды, оповещения, логи
    wrapMethod(discord.Message?.prototype, 'reply');
    wrapMethod(discord.Message?.prototype, 'edit');
    for (const name of ['TextChannel', 'NewsChannel', 'VoiceChannel', 'ThreadChannel', 'DMChannel',
                        'PartialGroupDMChannel', 'ForumChannel', 'MediaChannel', 'StageChannel']) {
        wrapMethod(discord[name]?.prototype, 'send');
    }
    wrapMethod(discord.User?.prototype, 'send');
    wrapMethod(discord.GuildMember?.prototype, 'send');
    wrapMethod(discord.Webhook?.prototype, 'send');

    watchDictionary();
    return true;
}

let watcher = null;

/** Следит за файлами словаря: правки переводов подхватываются без перезапуска бота. */
function watchDictionary() {
    if (watcher) return false;
    try {
        let timer = null;
        watcher = fs.watch(LOCALES_DIR, (event, file) => {
            if (!file || !file.startsWith(DICTIONARY_PREFIX) || !file.endsWith('.json')) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                reload();
                const { phrases } = stats();
                console.log(`[i18n] Словарь обновлён на диске — ${phrases} фраз`);
            }, 400);
        });
        watcher.unref?.();
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    install,
    watchDictionary,
    translateApplicationCommand,
    startMissCollector,
    flushMisses,
    missed: () => new Map(misses),
    translateText,
    translatePayload,
    patternize,
    maskWithTokens,
    fillTokens,
    dictionary,
    stats,
    reload,
    TRANSLATABLE_KEYS
};
