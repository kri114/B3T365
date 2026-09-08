import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    balanceCents: integer("balance_cents").notNull().default(0),
    isAdmin: boolean("is_admin").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
    banReason: text("ban_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("users_username_lower_idx").on(t.username)],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  message: text("message").notNull(),
  tone: text("tone").notNull().default("info"), // info | gold | alert
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bets = pgTable(
  "bets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("single"), // single | multi
    stakeCents: integer("stake_cents").notNull(),
    totalOdds: real("total_odds").notNull(),
    potentialCents: integer("potential_cents").notNull(),
    status: text("status").notNull().default("open"), // open | won | lost | void
    note: text("note"),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("bets_user_status_idx").on(t.userId, t.status)],
);

export const betSelections = pgTable(
  "bet_selections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    betId: uuid("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    league: text("league").notNull(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    market: text("market").notNull(), // 1X2 | DC | OU | BTTS
    line: real("line"), // for OU (e.g. 2.5)
    pick: text("pick").notNull(), // home|draw|away | 1X|12|X2 | over|under | yes|no
    label: text("label").notNull(),
    odds: real("odds").notNull(),
    status: text("status").notNull().default("open"), // open | won | lost | void
  },
  (t) => [
    index("selections_bet_idx").on(t.betId),
    index("selections_event_idx").on(t.eventId, t.league),
  ],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id"),
    deltaCents: integer("delta_cents").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    kind: text("kind").notNull(), // admin_credit | admin_debit | bet_stake | bet_payout | bet_refund | bet_void
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("tx_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type BetSelection = typeof betSelections.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
