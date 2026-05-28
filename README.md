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

Open `http://localhost:3000`.

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

This runs lint, tests, a clean production build, clears the Next.js cache, restarts the local dev server, and smoke-checks the main pages for server/app errors.

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
- `/history` History: T, average price, cash, quantity charts
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
