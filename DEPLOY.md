# Как бесплатно запустить бота (без карты и без опыта)

Схема: **GitHub** (хранит код) → **Render** (бесплатно крутит бота 24/7) + **Neon** (бесплатная база данных) → **UptimeRobot** (пингует бота раз в 5 минут, чтобы Render его не выключал).

Ни один из сервисов не просит банковскую карту. Время: ~30–40 минут.

---

## Шаг 0. Смените пароль от Gmail

Пароль от почты был написан в чате — считайте его скомпрометированным.
Зайдите в [аккаунт Google](https://myaccount.google.com/security) → «Пароли» → смените.

---

## Шаг 1. Ключи Discord (уже должны быть)

Зайдите на [discord.com/developers/applications](https://discord.com/developers/applications), откройте приложение бота:
- **Bot** → скопируйте токен (он в вашем `.env` как `BOT_TOKEN`)
- **General Information** → Application ID (это `CLIENT_ID`)

Если токен утерян — «Reset Token» (старый перестанет работать).

---

## Шаг 2. GitHub — загрузить код

1. Зарегистрируйтесь на [github.com](https://github.com) (email + пароль, лучше **другой**, не от Gmail).
2. Нажмите **+** (сверху справа) → **New repository**:
   - Repository name: `yuuki`
   - Public
   - Галочки снять все → **Create repository**
3. На странице репозитория выберите вкладку **CLI**, скопируйте блок команд целиком (начинается с `git remote add origin ...`), откройте папку проекта в проводнике, в пустом месте файла Explorer нажмите **ПКМ → Открыть в терминале** и вставьте. Перед push попросите GitHub создать **Personal Access Token** (Settings → Developer settings → Tokens → Generate, галочка `repo`) — вместо пароля при push вводите этот токен.

---

## Шаг 3. Neon — бесплатная база данных

1. Зайдите на [neon.tech](https://neon.tech), нажмите **Sign up** и выберите **Continue with GitHub** (та же учётка).
2. **Create a project**: имя любое (например `yuuki`), регион **Europe (Frankfurt)** → Create.
3. На странице проекта скопируйте строку под названием **Connection string** (начинается с `postgresql://...`). Это ваш `DATABASE_URL`. Сохраните её куда-нибудь — она понадобится на Шаге 5.

> Neon бесплатен: 0.5 ГБ базы — этому боту хватит с запасом. Карта не нужна.

---

## Шаг 4. Render — бесплатный хостинг

1. Зайдите на [render.com](https://render.com), **Get Started** → **Sign up with GitHub** (карта не нужна).
2. Верифицируйте email по письму.
3. **New +** (сверху слева) → **Web Service** → подключите свой репозиторий `yuuki` (нажмите Connect).
4. Настройки сервиса:
   - Name: `yuuki`
   - Runtime: **Docker** (Render сам найдёт Dockerfile)
   - Instance Type: **Free**
   - Region: **Frankfurt (EU)** — ближе к России
5. Внизу, в блоке **Environment Variables**, добавьте по одной:

   | Имя | Откуда взять |
   |---|---|
   | `BOT_TOKEN` | Шаг 1 |
   | `CLIENT_ID` | Шаг 1 |
   | `DATABASE_URL` | Шаг 3 (Neon) |
   | `GROQ_API_KEY` | (необязательно) [console.groq.com/keys](https://console.groq.com/keys) — бесплатный ИИ-чат |
   | `NODE_ENV` | значение `production` |

   Остальные ключи (`SERPAPI_API_KEY`, `BYTEZ_API_KEY`, `TENOR_API_KEY`) необязательны — соответствующие фичи просто не заработают, бот запустится.

6. Нажмите **Create Web Service**. Первый деплой идёт ~10 минут (сборка Docker). Следите за вкладкой **Logs** — в конце должно появиться сообщение о готовности бота, и он появится онлайн в Discord.

Адрес вашего бота будет вида `https://yuuki-xxxx.onrender.com` — он отвечает «Yuuki is running» (это healthcheck).

> Бесплатный сервис на Render засыпает после ~15 минут без входящих запросов — поэтому Шаг 5 обязателен. Бесплатный план: 750 часов в месяц, этого ровно на один бота 24/7.

---

## Шаг 5. UptimeRobot — «будильник», чтобы бот не спал

1. Зайдите на [uptimerobot.com](https://uptimerobot.com) → **Sign Up** (email + пароль, карта не нужна).
2. **Add New Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `yuuki`
   - URL: ваш адрес с Шага 4 (`https://yuuki-xxxx.onrender.com`)
   - Monitoring Interval: **5 minutes**
3. **Create Monitor**. Готово — Render получает запрос каждые 5 минут и не выключает бота.

---

## Шаг 6. Проверка

- В Discord бот должен быть онлайн.
- Если что-то не так — вкладка **Logs** в Render покажет ошибку. Частые причины: неверный `BOT_TOKEN`, неверная строка `DATABASE_URL` (не забудьте `?sslmode=require` в конце — у Neon он уже есть в скопированной строке).

---

## Обновление бота

После любых изменений кода на компьютере:

```bash
git add .
git commit -m "update"
git push
```

Render сам подхватит изменения и пересоберёт (~5 минут).

---

## Лимиты бесплатных сервисов (чтобы не было сюрпризов)

| Сервис | Бесплатно | Ограничение |
|---|---|---|
| Render | 750 часов/мес, 512 МБ RAM, сон без пинга | хватает ровно на одного бота 24/7 |
| Neon | 0.5 ГБ базы | спит после простоя, но бот держит её живой |
| UptimeRobot | 50 мониторов | 500 запросов/мес на бесплатном тарифе достаточно |
| GitHub | безлимитный приватный репозиторий | — |
