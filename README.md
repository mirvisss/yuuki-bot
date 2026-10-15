<div align="center">

# Yuuki

A feature-rich, open source multipurpose Discord bot built with Discord.js v14.
Designed for server protection, community management, AI chat, and automation.

[![Discord](https://img.shields.io/discord/1414217749038891102?color=5865F2&label=Support&logo=discord&logoColor=white)](https://discord.gg/aerox)

</div>

---

## Overview

Yuuki is a fully self-hostable, open source multipurpose Discord bot engineered to replace the need for several bots in a single server. It supports both **prefix commands** (default: `,`) and **slash commands** through a unified hybrid command system. Persistent data is stored in a **PostgreSQL** database via Sequelize ORM, and every feature is configurable on a per-server basis through setup commands.

---

## Features

### Security & Antinuke
Protect your server from malicious actors and raids.

- Detects and blocks mass channel deletions, role deletions, webhook creations, and unauthorized bot joins
- Interactive setup wizard with configurable thresholds and punishment actions
- Per-server whitelist management for trusted users and bots

### Moderation
Essential tools for keeping your server in order.

- Ban, kick, mute, and temporary role assignment with reason tracking
- Slowmode, channel lock/unlock, and nickname management
- Bulk message purging with filters (user, bots, all)
- Full voice moderation: mute, deafen, kick, move, pull, lock, and private channels

### Automod
Automatic rule enforcement without manual intervention.

- Invite link and URL filtering with configurable whitelists
- Anti-spam and mass mention detection
- Per-channel and per-role whitelist support

### Logging
A comprehensive server audit trail.

- Tracks message edits and deletions with content snapshots
- Logs server changes: channels, roles, and emojis
- Member joins, leaves, user updates, and voice state changes
- Fully configurable log channel routing per event type

### AI Integration
A built-in conversational AI assistant named Yuuki.

- Powered by **Groq API** for fast language model responses
- Image analysis via **Gemini Vision API**
- Real-time web search via **SerpAPI**
- Per-channel enable/disable toggle
- Custom identity — does not reveal underlying model or provider

### Ticketing
A complete support ticket system.

- Multiple ticket categories with dedicated staff roles
- Claim, transfer, rename, close, delete, and reopen tickets
- Full ticket transcripts
- Panel embeds for self-service ticket creation

### Giveaways
Run clean and fair giveaways.

- Create giveaways with a custom prize, duration, and winner count
- End giveaways early and reroll winners at any time
- Automated ending with winner announcement

### Welcome & Farewell
Fully customizable join and leave messages.

- Rich embed configuration with image and background support
- Test command to preview messages before going live
- Per-server setup with channel routing

### Profile System
User identity and engagement tracking.

- Canvas-generated profile cards with custom biography, background, and social links
- View profiles for any server member
- Global message and invite leaderboards

### Utility
A wide range of general-purpose tools.

- Unit and encoding conversions (cm/ft, kg/lb, Base32, Hex, Rot13, Binary)
- Server info, user info, role info, and invite tracking with join positions
- Export server data: bans, roles, members, and messages to file
- AFK status, personal reminders, todo lists, Wikipedia search, calculator

### Automation
Background systems that run without manual input.

- **Join to Create (J2C)** — dynamic temporary voice channels
- **Autopost** — schedule recurring messages in any channel
- **Autobump** — automated server bump scheduling
- **Autoreact** — auto-react to messages in configured channels
- **Vanity Roles** — assign roles based on user Discord status text
- **Reaction Roles** — reaction and button-based role assignment

### Fun & Roleplay
Engagement commands for active communities.

- Roleplay commands: hug, kiss, slap, pat, and more
- Animal facts and images, meme generation, ship calculator, fake hack
- GitHub and YouTube search integrations

---

## Setup

**Requirements:** Node.js >= 18, PostgreSQL database

```bash
# 1. Clone the repository
git clone <repository-url>
cd yuuki

# 2. Install dependencies
npm install

# 3. Configure the bot
# Copy the environment template and fill in your token, client ID, database URL, and API keys.
# Secrets are read from .env (never committed) — src/config.js only holds non-secret settings.
cp .env.example .env

# 4. Start the bot
npm start
```

---

## Emoji Synchronisation

Yuuki uses **application emojis** — emojis uploaded directly to the bot's Discord application — so they are available globally across every server without requiring a dedicated emoji server.

On first start, if a `tempassets/` folder is present in the project root containing emoji images (`.webp` for static, `.gif` for animated), Yuuki automatically:

1. Uploads every image to the bot's application emojis via the Discord API
2. Updates `src/emojis.json` with the new emoji IDs
3. Deletes the `tempassets/` folder
4. Restarts once to load the updated IDs

On all subsequent starts the folder is absent, so the sync is skipped and the bot boots normally. No manual setup is required — the entire process is handled at startup.

> **Note:** `tempassets/` is excluded from the repository via `.gitignore`. To re-run the sync (e.g. after adding new emojis), recreate the folder with the new images and restart the bot.

---

## Configuration

**Secrets** (`BOT_TOKEN`, `CLIENT_ID`, `DATABASE_URL`, `GROQ_API_KEY*`, `SERPAPI_API_KEY`, `BYTEZ_API_KEY`, `TENOR_API_KEY`) are read from `.env`, which is git-ignored. Copy [`.env.example`](./.env.example) and fill in your own values; real environment variables always take precedence over the file.

All other configuration lives in `src/config.js`.

| Key | Description |
|-----|-------------|
| `BOT_TOKEN` *(env)* | Discord bot token from the Developer Portal |
| `CLIENT_ID` *(env)* | Bot application/client ID |
| `DATABASE_URL` *(env)* | PostgreSQL connection string |
| `GROQ_API_KEY` *(env)* | Groq API key for AI chat (optional `_2`..`_4` as fallbacks) |
| `SERPAPI_API_KEY` *(env)* | SerpAPI key for web search in AI responses |
| `BYTEZ_API_KEY` *(env)* | Bytez API key for AI image generation |
| `TENOR_API_KEY` *(env)* | Tenor API key for roleplay GIFs |
| `OWNER_ID` | Your Discord user ID for owner-only commands |
| `PREFIX` | Default text command prefix (default: `,`) |
| `STATUS.status` | Bot presence: `online`, `idle`, `dnd`, `invisible` |
| `STATUS.activity` | Bot activity display text |
| `SUPPORT_SERVER` | Your support server invite link |

The database schema is automatically synced on startup — no manual migrations required.

---

## Project Structure

```
src/
├── client.js                    Entry point — initializes client, DB, and loaders
├── config.js                    Bot configuration and API keys
├── emojis.json                  Application emoji mappings (name → formatted string)
├── hybrid/                      Hybrid slash + prefix commands
│   ├── ai/                      Yuuki AI chat
│   ├── antinuke/                Antinuke protection
│   ├── automod/                 Automated moderation
│   ├── autobump/                Server bump automation
│   ├── autopost/                Scheduled message posting
│   ├── autoreact/               Auto-reaction bindings
│   ├── farewell/                Farewell messages
│   ├── giveaway/                Giveaway management
│   ├── j2c/                     Join to Create voice channels
│   ├── leaderboard/             Message and invite leaderboards
│   ├── logging/                 Audit log configuration
│   ├── profile/                 User profile cards
│   ├── reactionroles/           Reaction-based role assignment
│   ├── remind/                  Personal reminders
│   ├── ticket/                  Full ticket system
│   ├── todo/                    Personal todo lists
│   ├── vanityroles/             Status-based role assignment
│   ├── voice/                   Voice channel moderation
│   ├── welcome/                 Welcome messages
│   └── ...                      And more
├── gateway/                     Discord event handlers
│   ├── antinuke/                Antinuke detection logic
│   ├── automod/                 Automod enforcement
│   ├── interactions/            Interaction-specific handlers
│   ├── messageCreate.js         Prefix command dispatcher
│   ├── interactionCreate.js     Slash command dispatcher
│   ├── welcomeEvent.js          Welcome trigger
│   ├── farewellEvent.js         Farewell trigger
│   ├── voiceStateUpdate.js      J2C and voice events
│   ├── trackUserInvites.js      Invite usage tracking
│   ├── trackUserMessages.js     Message count tracking
│   └── ...                      And more
├── data/
│   └── models/                  Sequelize database models (27 total)
├── lib/                         Internal utilities and helpers
│   ├── emojiSync.js             Startup emoji synchronisation
│   ├── profileCard.js           Canvas profile card renderer
│   ├── pagination.js            Paginated embed component
│   ├── giveawayUtils.js         Giveaway timer and result logic
│   ├── ticketUtils.js           Ticket creation and management
│   ├── commandLoader.js         Dynamic command loader
│   └── ...                      And more
└── static/                      Static assets (fonts, badges, images)
```

---

## Support

Join the support Discord server for help, updates, and community support.

**[discord.gg/aerox](https://discord.gg/aerox)**

---

<div align="center">

© 2026 Yuuki. All rights reserved.

</div>
