# Goldbit - GoldOrbit

Goldbit is a SOXL-only dashboard for manually managing Infinite Buying Strategy V4.0.

GoldOrbit is the core concept of the project: a disciplined investment loop that helps a solo investor mine gains through repeated buy and sell cycles.

Tagline: **Mine gains, loop by loop.**

## Important Notice

Goldbit is not investment advice, not a brokerage tool, and not an automated order system. It does not place real orders or connect to brokerage APIs. v1 helps users calculate, record, and review a manual SOXL strategy.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui-style local components
- Recharts
- Prisma
- SQLite for the local MVP
- Vitest

## Install

This repository declares the required packages in `package.json`.

```bash
npm install
cp .env.example .env
npm run prisma:generate
```

## Run

```bash
npm run dev
```

Open `http://localhost:7777`.

For phone access through Tailscale, use:

```bash
npm run dev:tailnet
```

Then follow [docs/tailscale.md](docs/tailscale.md).

## Telegram Bridge

Goldbit v2 can receive Telegram messages through a local long-polling bridge.
This is private-local integration: Telegram sends messages to the bot, the
local PC polls Telegram, OCR/parses the content, and creates a Pending Trade in
Goldbit with a post-fill preview. Reply `추가` to confirm the latest Telegram
pending trade, or `취소` to reject it.

Telegram supported flows:

- `/today`: show Today Action Plan and save the plan snapshot for later T
  recommendation.
- Send broker fill screenshot/text: create Pending Trade and receive post-fill
  preview.
- `추가`: add the latest pending Telegram trade to Trades.
- `취소`: reject the latest pending Telegram trade.
- `/t`: recommend the Daily T update from the saved action plan and confirmed
  trades.
- `T추가`: apply the latest recommended Daily T update.

Add these values to `.env`:

```bash
GOLDBIT_APP_URL="http://localhost:7777"
TELEGRAM_BOT_TOKEN="<your-bot-token>"
TELEGRAM_ALLOWED_CHAT_IDS=""
TELEGRAM_POLL_TIMEOUT_SECONDS="25"
```

Check the bot connection:

```bash
npm run telegram:check
```

Start the bridge while Goldbit is running:

```bash
npm run telegram:poll
```

Recommended Telegram setup:

- Send `/start` to the bot.
- Copy the returned `Chat ID`.
- Set `TELEGRAM_ALLOWED_CHAT_IDS="<chat-id>"` in `.env`.
- Restart `npm run telegram:poll`.
- Send a broker fill screenshot or OCR text.
- Review the Telegram post-fill preview.
- Reply `추가` to add it to Trades, or `취소` to reject it.
- Send `/t` after the day's trades are confirmed.
- Reply `T추가` to apply the recommended T update.
- Open `/trades` to review the final record.

Security notes:

- Keep `TELEGRAM_BOT_TOKEN` out of git.
- Do not expose Goldbit to the public internet.
- Prefer Tailscale for phone access to the Goldbit web UI.
- Rotate the bot token if it is ever shared outside your private environment.

Current personal remote access pattern:

- PC Tailscale machine name: `goldbit`
- Phone browser: Chrome app
- Phone URL: `http://goldbit:7777`
- Tailscale is used instead of public port forwarding.
- Windows Firewall allows inbound TCP `7777` from Tailscale CGNAT
  `100.64.0.0/10`.
- Phone data entry and app state updates have been verified through this path.

Goldbit v2 uses local SQLite state storage through Prisma. Create `.env`
from `.env.example` before running locally:

```bash
cp .env.example .env
npm run prisma:generate
```

## Test

```bash
npm run test:run
```

The calculation tests cover:

- SOXL 20-division star rate
- SOXL 40-division star rate
- star price
- buy point
- daily one-turn buy amount
- normal-mode T changes
- quarter sell quantity
- SOXL 20% limit sell price
- reverse-mode entry
- reverse first-day sell quantity
- reverse star price from five closes
- reverse-mode T changes
- reverse-mode exit

## Update Verification

After code updates, run the full local verification routine:

```bash
npm run verify:update
```

This runs lint, tests, a clean production build, clears the Next.js cache, restarts the local dev server, and smoke-checks the main pages for server/app errors. If the Prisma schema changes, run `npm run prisma:generate` before verification.

If the local page looks broken after a code change, restart from a clean Next.js cache:

```bash
npm run dev:clean
```

## Main Features

- SOXL-only strategy dashboard
- 20-division and 40-division support
- Normal mode and reverse mode rules
- T Value, average price, cash reserve, and quantity tracking
- Star Price, Buy Point, Sell Point, and LIMIT sell price calculation
- Today&apos;s buy and sell order plan
- Previous close input that refreshes Today&apos;s plan and the rolling five-close list
- Delayed SOXL quote fetch for quickly filling the latest close
- Manual trade entry with post-fill state preview
- History charts for T Value, average price, cash reserve, and quantity
- Prisma schema prepared for SQLite and future PostgreSQL migration

## Calculation Summary

Normal mode:

- SOXL 20-division star rate: `(20 - 2 * T)%`
- SOXL 40-division star rate: `(20 - T)%`
- Star Price: `averagePrice * (1 + starRate)`
- Buy Point: `starPrice - 0.01`
- Sell Point: `starPrice`
- SOXL target LIMIT sell: `averagePrice * 1.2`
- Daily buy amount: `cashBalance / (division - T)`
- First half: half of one-turn budget at Star Price and half at average price
- Second half: full one-turn budget at Star Price

Normal T changes:

- Full buy: `T + 1`
- Half buy: `T + 0.5`
- Quarter sell: `T * 0.75`
- LIMIT sell plus full LOC buy: `T * 0.25 + 1`
- LIMIT sell plus half LOC buy: `T * 0.25 + 0.5`

Reverse mode:

- 20-division entry: `T > 19`
- 40-division entry: `T > 39`
- First day: MOC sell only
- 20-division first sell quantity: `floor(quantity / 10)`
- 40-division first sell quantity: `floor(quantity / 20)`
- Reverse Star Price: average of the last five trading closes
- Reverse buy amount: `cashBalance / 4`
- 20-division reverse sell T: `T * 0.9`
- 40-division reverse sell T: `T * 0.95`
- Reverse buy T: `T + (division - T) * 0.25`
- SOXL reverse exit: close price is greater than `averagePrice * 0.8`

## Pages

- `/` Dashboard: overall state, Today&apos;s Action, reverse warning
- `/today` Today: planned LOC, MOC, and LIMIT order tables
- `/trades` Trades: manual fill input and trade history
- `/report` Report: current-cycle T, average price, cash, quantity, and asset charts
- `/history` History: archived completed cycles after reset/end-cycle
- `/settings` Settings: local strategy baseline and recent closes

## Roadmap

### v1

- SOXL-only personal dashboard
- Mock-data UI
- Pure calculation functions
- Manual trade logging flow
- Prisma SQLite schema

### v2

- Delayed or real-time SOXL price integration
- Last five trading closes automation
- TQQQ support
- Separate SOXL/TQQQ strategy management

### v3

- User login
- Account-level data separation
- Cloud database
- Backup and restore
- Backtesting for strategy review
- Small-scale hosted service
