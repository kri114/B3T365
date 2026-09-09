# bet365 — Virtual Sportsbook (Setup & Operations Manual)

A private, **virtual-currency** sportsbook: real fixtures and live scores from ESPN's free
keyless API, odds computed by a factor-based pricing engine, virtual euros only. No real money is
accepted, staked, won or paid out anywhere in this project.

> ⚠️ Legal note: the name and concept are for a **private demo** among friends. This project is not
> affiliated with, endorsed by, or connected to any real bookmaker. Do not deploy it publicly
> under this branding or accept real money — that would be illegal gambling operation and
> trademark infringement.

---

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18.18+ (or 20+) |
| PostgreSQL | 14+ (local instance provided in the sandbox) |
| npm | 9+ |

No API keys are needed — ESPN's endpoints are free and keyless.

## 2. Installation

```bash
npm install            # install dependencies
```

The `.env` file already contains the database connection:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

Point it at your own PostgreSQL if you run this elsewhere.

## 3. Database setup

Locally:

```bash
npx drizzle-kit push
```

**On Render (free tier, no Shell available):** you don't need to run anything.
The server **self-bootstraps** its schema and the admin account on every start
(`src/instrumentation.ts`), so no `drizzle-kit push` is ever required:

```
Build Command:  npm install && npm run build
Start Command:  npm run start
```

Also check Render's **Root Directory**: if your repo wraps the app in a folder
(e.g. `bet365/`), set Root Directory to that folder so `package.json` is found.

`scripts/ensure-db.mjs` remains as an optional manual diagnostic tool — run it
only if the boot logs (`[bootstrap] …`, `[db] …`) indicate a connection problem.

## 4. The admin account (KriAdmin)

On **first server start** the app seeds the admin account automatically
(`src/instrumentation.ts` → `src/lib/bootstrap.ts`):

| Field | Value |
|---|---|
| Username | `KriAdmin` |
| Password | `Krikri1104` |
| Balance | €0.00 |

* To change these without touching code, set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`
  **before the first start**. (If the user already exists, the env vars are ignored — delete the
  user row or update it in the DB to re-seed.)
* **Single-device rule (strict):** while an admin session exists, **no other device can sign in at
  all** — there is no idle timeout. The hold ends only when the admin explicitly signs out. The
  session cookie is persistent, so restarting your browser keeps you signed in and the lock held.
* **If you ever lose that signed-in session** (cookies cleared, device replaced, profile wiped),
  recover with either:
  * `POST /api/admin/unlock` with body `{"key":"<ADMIN_UNLOCK_KEY>"}` — set `ADMIN_UNLOCK_KEY` in
    your environment (Render → Environment) to enable this endpoint, or
  * `delete from sessions;` run directly against the database.
* The admin account **cannot be banned** and other admin promotion only happens via the bootstrap
  (or directly in the DB: `UPDATE users SET is_admin = true WHERE username = '…'`).

## 5. Run it

```bash
npm run dev        # development
# or
npm run build && npm run start   # production
```

Open `http://localhost:3000`.

## 6. Daily operation

### Sign players up
Players register at `/signup`. **There is no signup/deposit bonus** — every new wallet starts at
€0.00 and waits for you to fund it.

### Negative balances & overdrafts
Every player has an **overdraft allowance** (`credit_limit_cents`, default **€100**) — how far below
€0 they may stake. A losing run therefore leaves the balance **negative**, shown in red across the
app. Set it per player in **Users & Wallets → Overdraft** (`0` = strictly never negative, higher =
high roller). **Admin deductions ignore the overdraft entirely** and can push anyone as deep into
the red as you like. Change the default for new accounts in `src/lib/db-setup.ts`.

### Fund / fine wallets (decide who wins & loses money)
Admin → `/admin` → **Users & Wallets**:
type an amount in the row's € field and press **+** (credit) or **−** (debit). Add an optional note
("weekly budget", "fine") — it appears in the player's wallet ledger instantly.

### Decide bet outcomes
`/admin` → **Bets**: every ticket has **WON / LOST / VOID** force-buttons.
* WON pays the potential return immediately.
* LOST keeps the stake.
* VOID refunds the stake.
Overrides reverse any prior settlement first, so you never double-pay. Automatic settlement still
runs normally for anything you don't touch (tickets settle at full time from ESPN results).

### Ban / unban
`/admin` → **Users & Wallets** → **Ban**. A banned user's sessions are destroyed instantly and they
cannot log in (with an optional reason shown). **Unban** restores access.

### Announcements
`/admin` → **Announcements**: publish a message (gold / info / alert tone). It renders as a banner
at the top of every player's screen until hidden or deleted. Players can dismiss it locally.

## 7. How the odds engine works (and how to make them even more realistic)

Prices are **calculated, never random** (`src/lib/odds.ts` + `src/lib/espn.ts`):

1. **Strength** — attack/defence ratings from season goals for/against per league (ESPN standings),
   normalised to the league scoring baseline → expected goals (xG) per side.
2. **Morale** — last-five form from the standings feed nudges xG (±~8%).
3. **Venue** — home advantage via the historical home share of league goals (~57%).
4. **On-field model** — a Poisson goal matrix derives P(home/draw/away), totals (1.5/2.5/3.5) and BTTS.
5. **Market anchor** — when ESPN lists bookmaker moneylines for a fixture, they are de-vigged and
   blended in at 45%.
6. **Margin** — a fixed overround (~6% three-way / ~5% two-way) mimics a real book.
7. **Live** — in-play prices recompute from scoreline + elapsed minute with remaining-time decay;
   already-decided markets suspend automatically (e.g. Over 2.5 once 3 goals are scored).

**Ways to push realism further (roadmap):**
* Blend 20–30% of a real bookmaker feed (e.g. The Odds API — free tier) on top of the market anchor.
* Add injury/suspension multipliers from ESPN's roster feeds.
* Track opening vs. current price per fixture and shade the vig toward the popular side.
* Elo-style team ratings that self-update from settled results instead of raw season averages.

## 8. Betting features

* Markets: Match Result (1X2), Double Chance, Over/Under 1.5–3.5, Both Teams To Score.
* Bet types: **Singles** and **Multis (accumulators)** — one leg per fixture, combined odds,
  min stake €0.10, max combined odds 5000.
* In-play betting with live repricing & price-movement flash indicators on the board.
* Automatic settlement at full time; postponed fixtures void (refund); void legs in a multi
  simply drop out and the ticket pays at reduced odds — like real books.
* Every movement (stake, payout, refund, house credit/debit) is written to the wallet ledger.

## 9. Leagues covered (ESPN feed)

Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League,
Eredivisie, Primeira Liga, Championship, MLS — editable in `src/lib/constants.ts` (any ESPN soccer
slug works, e.g. `fifa.world` for the World Cup).

## 10. Useful commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run start          # production server
npm run typecheck      # TS check
npx drizzle-kit push   # apply schema changes
npx drizzle-kit studio # browse/edit the DB in a GUI
```

## 11. Locked out of the admin account?

The bootstrap is **self-healing** on every server start, so recovery is quick:

| Symptom | Cause | Fix |
|---|---|---|
| Sign in: *"Invalid username or password"* + Sign up: *"username already taken"* | The server booted before `npx drizzle-kit push` ran, the seed failed, and you registered `KriAdmin` yourself with a different password (non-admin account) | **Quickest:** run the recovery script (below) and restart. The bootstrap also auto-recovers this state on next boot |
| Sign in fails with *"Sign-in failed. Try again."* (500) | Tables don't exist — `drizzle-kit push` was never run | Run it, then restart the service |
| Changed `ADMIN_PASSWORD` but old password still works | Env vars are only honoured when the account is missing — unless you set them | With the new bootstrap, setting `ADMIN_USERNAME` / `ADMIN_PASSWORD` explicitly re-syncs the hash on every boot |

**Recovery script (works on Render's Shell, or locally):**

```bash
node scripts/reset-admin.mjs
```

Creates the admin if missing; otherwise force-resets it: promotes to admin, unbans,
resets the password and revokes every session. Idempotent — safe to run repeatedly.

## 12. Troubleshooting

* **"Few fixtures" / empty board** — ESPN is briefly unreachable or it's a low-matchday window;
  the feed retries on every poll (12–30 s). Leagues in off-season simply have no fixtures.
* **Admin didn't seed** — check server logs for `[bootstrap]`; ensure `npx drizzle-kit push`
  succeeded before the first start (it retries once after 5 s).
* **Reset a player password** — update the row directly:
  `npx drizzle-kit studio` → users → set `password_hash` (generate via `hashPassword()`), or delete
  the user and let them re-register.
