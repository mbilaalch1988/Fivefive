import pg from "pg";

/**
 * Lazy Postgres pool. Active only if DATABASE_URL is set; otherwise every
 * scoreboard write/read is a no-op and scores live only in memory.
 */
let pool: pg.Pool | null = null;
let initialized = false;

export function isPersistenceEnabled(): boolean {
  return pool !== null;
}

export async function initDb(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[db] DATABASE_URL not set, scoreboard persistence disabled");
    return;
  }

  // Parse the URI manually so usernames containing dots (Supabase pooler:
  // `postgres.<project-ref>`) and percent-encoded passwords are handled
  // robustly, regardless of pg-connection-string version quirks.
  let cfg: pg.PoolConfig;
  try {
    const u = new URL(url);
    cfg = {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, "") || "postgres",
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
    };
  } catch (e) {
    console.error("[db] DATABASE_URL is not a valid URI:", (e as Error).message);
    return;
  }
  pool = new pg.Pool(cfg);

  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });

  try {
    await runMigration();
    console.log("[db] connected, schema ready");
  } catch (e) {
    console.error("[db] init failed:", (e as Error).message);
    await pool.end().catch(() => undefined);
    pool = null;
  }
}

async function runMigration(): Promise<void> {
  if (!pool) return;
  // Migration is idempotent: creates tables if missing, then adds new columns
  // (ALTER TABLE IF NOT EXISTS available since Postgres 9.6).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_meta (
      room_code TEXT PRIMARY KEY,
      games_played INT NOT NULL DEFAULT 0,
      team_name_red TEXT NOT NULL DEFAULT 'Red',
      team_name_blue TEXT NOT NULL DEFAULT 'Blue',
      team_name_green TEXT NOT NULL DEFAULT 'Green',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_scores (
      room_code TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('red', 'blue', 'green')),
      wins INT NOT NULL DEFAULT 0,
      PRIMARY KEY (room_code, team)
    );

    CREATE TABLE IF NOT EXISTS player_scores (
      room_code TEXT NOT NULL,
      player_name TEXT NOT NULL,
      wins INT NOT NULL DEFAULT 0,
      PRIMARY KEY (room_code, player_name)
    );

    -- Global leaderboards: total wins and games across ALL rooms.
    -- player_stats keyed by display name (matches scoreboard merging behavior).
    CREATE TABLE IF NOT EXISTS player_stats (
      name TEXT PRIMARY KEY,
      total_wins INT NOT NULL DEFAULT 0,
      total_games INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- team_stats keyed by the host-chosen team display name.
    CREATE TABLE IF NOT EXISTS team_stats (
      name TEXT PRIMARY KEY,
      total_wins INT NOT NULL DEFAULT 0,
      total_games INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- New player career stats (added after initial deploy).
    ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sequences_closed INT NOT NULL DEFAULT 0;
    ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS mvp_games INT NOT NULL DEFAULT 0;
    ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS chips_placed INT NOT NULL DEFAULT 0;
    -- Career count of sequences personally closed that pushed a team to win.
    ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS winning_sequences_closed INT NOT NULL DEFAULT 0;

    -- Signed-in user career stats keyed by Supabase auth.users.id.
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id UUID PRIMARY KEY,
      display_name TEXT NOT NULL,
      total_wins INT NOT NULL DEFAULT 0,
      total_games INT NOT NULL DEFAULT 0,
      sequences_closed INT NOT NULL DEFAULT 0,
      mvp_games INT NOT NULL DEFAULT 0,
      chips_placed INT NOT NULL DEFAULT 0,
      winning_sequences_closed INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Backfill for tables created before the column existed.
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS winning_sequences_closed INT NOT NULL DEFAULT 0;

    -- ------------------------------------------------------------
    -- Replay log: every game gets a UUID, every action gets a row.
    -- Lets us play back any finished (or abandoned) game.
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS game_log (
      game_id UUID PRIMARY KEY,
      room_code TEXT NOT NULL,
      deck_id TEXT,
      sequences_to_win INT NOT NULL,
      team_names JSONB NOT NULL,
      players JSONB NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      winning_team TEXT,
      action_count INT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_game_log_finished_at
      ON game_log (finished_at DESC NULLS LAST);
    -- Initial RNG seed — enables hand reconstruction for the Faizi
    -- analysis bot. Older rows (pre-Faizi) get NULL; those games can't
    -- be analyzed, only games from now on.
    ALTER TABLE game_log ADD COLUMN IF NOT EXISTS initial_seed BIGINT;

    -- Web push subscriptions, keyed by endpoint (browser-unique).
    -- Each subscription is bound to a specific (room, player) pair so we
    -- only ping the right person.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      room_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_room_player
      ON push_subscriptions (room_code, player_id);

    CREATE TABLE IF NOT EXISTS game_actions (
      game_id UUID NOT NULL REFERENCES game_log(game_id) ON DELETE CASCADE,
      action_index INT NOT NULL,
      player_name TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('red', 'blue', 'green')),
      card_rank TEXT NOT NULL,
      card_suit TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('place', 'remove', 'discardDead')),
      pos_r INT,
      pos_c INT,
      PRIMARY KEY (game_id, action_index)
    );
  `);
}

/* ------------------------------------------------------------------ */
/* Replay persistence                                                 */
/* ------------------------------------------------------------------ */

export interface GameStartRecord {
  gameId: string;
  roomCode: string;
  deckId: string | null;
  sequencesToWin: number;
  teamNames: { red: string; blue: string; green: string };
  players: Array<{ id: string; name: string; team: "red" | "blue" | "green" }>;
  /** RNG seed used by createInitialState — lets Faizi rebuild hands later. */
  initialSeed: number;
}

export async function persistGameStart(record: GameStartRecord): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO game_log (game_id, room_code, deck_id, sequences_to_win, team_names, players, initial_seed)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (game_id) DO NOTHING`,
      [
        record.gameId,
        record.roomCode,
        record.deckId,
        record.sequencesToWin,
        JSON.stringify(record.teamNames),
        JSON.stringify(record.players),
        record.initialSeed,
      ],
    );
  } catch (e) {
    console.warn("[db] persistGameStart failed:", (e as Error).message);
  }
}

/**
 * Fetch the persisted initial-RNG seed for a game. null when the row is
 * pre-Faizi (no seed recorded). Used by /api/replays/:id/faizi to
 * reconstruct hands.
 */
export async function getGameInitialSeed(gameId: string): Promise<number | null> {
  if (!pool) return null;
  try {
    const r = await pool.query<{ initial_seed: string | null }>(
      `SELECT initial_seed FROM game_log WHERE game_id = $1`,
      [gameId],
    );
    const raw = r.rows[0]?.initial_seed ?? null;
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export interface GameActionRecord {
  gameId: string;
  index: number;
  playerName: string;
  team: "red" | "blue" | "green";
  rank: string;
  suit: string;
  type: "place" | "remove" | "discardDead";
  pos: { r: number; c: number } | null;
}

export async function persistGameAction(rec: GameActionRecord): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO game_actions (game_id, action_index, player_name, team,
         card_rank, card_suit, action_type, pos_r, pos_c)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (game_id, action_index) DO NOTHING`,
      [
        rec.gameId,
        rec.index,
        rec.playerName,
        rec.team,
        rec.rank,
        rec.suit,
        rec.type,
        rec.pos?.r ?? null,
        rec.pos?.c ?? null,
      ],
    );
    await pool.query(
      `UPDATE game_log SET action_count = $2 WHERE game_id = $1`,
      [rec.gameId, rec.index + 1],
    );
  } catch (e) {
    console.warn("[db] persistGameAction failed:", (e as Error).message);
  }
}

export async function persistGameFinish(
  gameId: string,
  winningTeam: "red" | "blue" | "green" | null,
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE game_log
       SET finished_at = NOW(), winning_team = $2
       WHERE game_id = $1 AND finished_at IS NULL`,
      [gameId, winningTeam],
    );
  } catch (e) {
    console.warn("[db] persistGameFinish failed:", (e as Error).message);
  }
}

interface ReplaySummaryRow {
  game_id: string;
  room_code: string;
  started_at: Date;
  finished_at: Date | null;
  winning_team: string | null;
  action_count: number;
  team_names: { red: string; blue: string; green: string };
  players: Array<{ id: string; name: string; team: "red" | "blue" | "green" }>;
}

export async function listRecentReplays(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<ReplaySummaryRow>(
      `SELECT game_id, room_code, started_at, finished_at, winning_team,
              action_count, team_names, players
       FROM game_log
       WHERE finished_at IS NOT NULL
       ORDER BY finished_at DESC NULLS LAST
       LIMIT $1`,
      [limit],
    );
    return r.rows.map((row) => ({
      gameId: row.game_id,
      roomCode: row.room_code,
      startedAt: row.started_at.toISOString(),
      finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
      winningTeam: row.winning_team as "red" | "blue" | "green" | null,
      winningTeamName: row.winning_team
        ? (row.team_names[row.winning_team as "red" | "blue" | "green"] ?? null)
        : null,
      actionCount: Number(row.action_count),
      playerNames: row.players.map((p) => p.name),
    }));
  } catch (e) {
    console.warn("[db] listRecentReplays failed:", (e as Error).message);
    return [];
  }
}

interface ReplayActionRow {
  action_index: number;
  player_name: string;
  team: "red" | "blue" | "green";
  card_rank: string;
  card_suit: string;
  action_type: "place" | "remove" | "discardDead";
  pos_r: number | null;
  pos_c: number | null;
}

/* ------------------------------------------------------------------ */
/* Push subscriptions                                                 */
/* ------------------------------------------------------------------ */

export interface SavedPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  roomCode: string;
  playerId: string;
}

export async function savePushSubscription(s: SavedPushSubscription): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, room_code, player_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         room_code = EXCLUDED.room_code,
         player_id = EXCLUDED.player_id`,
      [s.endpoint, s.p256dh, s.auth, s.roomCode, s.playerId],
    );
  } catch (e) {
    console.warn("[db] savePushSubscription failed:", (e as Error).message);
  }
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
  } catch (e) {
    console.warn("[db] deletePushSubscription failed:", (e as Error).message);
  }
}

export async function getPushSubscriptions(
  roomCode: string,
  playerId: string,
): Promise<SavedPushSubscription[]> {
  if (!pool) return [];
  try {
    const r = await pool.query<{
      endpoint: string;
      p256dh: string;
      auth: string;
      room_code: string;
      player_id: string;
    }>(
      `SELECT endpoint, p256dh, auth, room_code, player_id
       FROM push_subscriptions
       WHERE room_code = $1 AND player_id = $2`,
      [roomCode, playerId],
    );
    return r.rows.map((row) => ({
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      roomCode: row.room_code,
      playerId: row.player_id,
    }));
  } catch (e) {
    console.warn("[db] getPushSubscriptions failed:", (e as Error).message);
    return [];
  }
}

export async function getReplay(gameId: string) {
  if (!pool) return null;
  try {
    const meta = await pool.query<ReplaySummaryRow & { deck_id: string | null; sequences_to_win: number }>(
      `SELECT game_id, room_code, deck_id, sequences_to_win,
              started_at, finished_at, winning_team, action_count,
              team_names, players
       FROM game_log
       WHERE game_id = $1`,
      [gameId],
    );
    if (meta.rows.length === 0) return null;
    const m = meta.rows[0]!;
    const acts = await pool.query<ReplayActionRow>(
      `SELECT action_index, player_name, team, card_rank, card_suit, action_type, pos_r, pos_c
       FROM game_actions
       WHERE game_id = $1
       ORDER BY action_index ASC`,
      [gameId],
    );
    return {
      gameId: m.game_id,
      roomCode: m.room_code,
      deckId: m.deck_id,
      sequencesToWin: Number(m.sequences_to_win),
      teamNames: m.team_names,
      players: m.players,
      startedAt: m.started_at.toISOString(),
      finishedAt: m.finished_at ? m.finished_at.toISOString() : null,
      winningTeam: m.winning_team as "red" | "blue" | "green" | null,
      actions: acts.rows.map((row) => ({
        index: row.action_index,
        playerName: row.player_name,
        team: row.team,
        rank: row.card_rank,
        suit: row.card_suit,
        type: row.action_type,
        pos:
          row.pos_r !== null && row.pos_c !== null
            ? { r: row.pos_r, c: row.pos_c }
            : null,
      })),
    };
  } catch (e) {
    console.warn("[db] getReplay failed:", (e as Error).message);
    return null;
  }
}

export interface PersistedRoomState {
  gamesPlayed: number;
  teamNames: { red: string; blue: string; green: string };
  teamScores: { red: number; blue: number; green: number };
  playerScores: Record<string, number>;
}

/** Load any previously-stored state for this room code. Empty if none / no DB. */
export async function loadRoomState(roomCode: string): Promise<PersistedRoomState | null> {
  if (!pool) return null;
  try {
    const [meta, teams, players] = await Promise.all([
      pool.query(
        "SELECT games_played, team_name_red, team_name_blue, team_name_green FROM room_meta WHERE room_code = $1",
        [roomCode],
      ),
      pool.query("SELECT team, wins FROM team_scores WHERE room_code = $1", [roomCode]),
      pool.query("SELECT player_name, wins FROM player_scores WHERE room_code = $1", [roomCode]),
    ]);
    if (meta.rows.length === 0) return null;
    const m = meta.rows[0]!;
    const teamScores = { red: 0, blue: 0, green: 0 } as Record<"red" | "blue" | "green", number>;
    for (const row of teams.rows) {
      teamScores[row.team as "red" | "blue" | "green"] = row.wins;
    }
    const playerScores: Record<string, number> = {};
    for (const row of players.rows) {
      playerScores[row.player_name] = row.wins;
    }
    return {
      gamesPlayed: m.games_played,
      teamNames: {
        red: m.team_name_red,
        blue: m.team_name_blue,
        green: m.team_name_green,
      },
      teamScores,
      playerScores,
    };
  } catch (e) {
    console.warn("[db] loadRoomState failed:", (e as Error).message);
    return null;
  }
}

export async function persistTeamName(
  roomCode: string,
  team: "red" | "blue" | "green",
  name: string,
): Promise<void> {
  if (!pool) return;
  const col = `team_name_${team}`;
  try {
    await pool.query(
      `INSERT INTO room_meta (room_code, ${col}) VALUES ($1, $2)
       ON CONFLICT (room_code) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = NOW()`,
      [roomCode, name],
    );
  } catch (e) {
    console.warn("[db] persistTeamName failed:", (e as Error).message);
  }
}

export interface PlayerGameContribution {
  name: string;
  /** Set when this player was signed in for this game; routes writes to user_stats. */
  userId: string | null;
  chipsPlaced: number;
  sequencesClosed: number;
  isWinner: boolean;
  isMvp: boolean;
  /** True if this player's placement triggered the win (closes the winning sequence). */
  isWinningSequencePlayer: boolean;
}

export interface WinRecord {
  roomCode: string;
  winningTeam: "red" | "blue" | "green";
  winningPlayerNames: string[];
  /** Display names of every team that played this game (winners + losers). */
  allTeamNames: string[];
  /** Display name of the winning team. */
  winningTeamName: string;
  /** Per-player breakdown — winners + losers + their per-game contributions. */
  contributions: PlayerGameContribution[];
}

export async function persistWin(record: WinRecord): Promise<void> {
  if (!pool) return;
  const {
    roomCode,
    winningTeam,
    winningPlayerNames,
    allTeamNames,
    winningTeamName,
    contributions,
  } = record;
  try {
    // Room-scoped (unchanged schema)
    await pool.query(
      `INSERT INTO room_meta (room_code, games_played) VALUES ($1, 1)
       ON CONFLICT (room_code) DO UPDATE SET games_played = room_meta.games_played + 1, updated_at = NOW()`,
      [roomCode],
    );
    await pool.query(
      `INSERT INTO team_scores (room_code, team, wins) VALUES ($1, $2, 1)
       ON CONFLICT (room_code, team) DO UPDATE SET wins = team_scores.wins + 1`,
      [roomCode, winningTeam],
    );
    for (const name of winningPlayerNames) {
      await pool.query(
        `INSERT INTO player_scores (room_code, player_name, wins) VALUES ($1, $2, 1)
         ON CONFLICT (room_code, player_name) DO UPDATE SET wins = player_scores.wins + 1`,
        [roomCode, name],
      );
    }

    // Global player stats — route by identity:
    //   userId set  -> user_stats  (keyed by immutable Supabase UUID)
    //   userId null -> player_stats (keyed by display name, anonymous)
    for (const c of contributions) {
      const winningSeqInc = c.isWinningSequencePlayer ? 1 : 0;
      if (c.userId) {
        await pool.query(
          `INSERT INTO user_stats (
             user_id, display_name, total_wins, total_games,
             sequences_closed, mvp_games, chips_placed, winning_sequences_closed
           ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             total_wins = user_stats.total_wins + EXCLUDED.total_wins,
             total_games = user_stats.total_games + 1,
             sequences_closed = user_stats.sequences_closed + EXCLUDED.sequences_closed,
             mvp_games = user_stats.mvp_games + EXCLUDED.mvp_games,
             chips_placed = user_stats.chips_placed + EXCLUDED.chips_placed,
             winning_sequences_closed = user_stats.winning_sequences_closed + EXCLUDED.winning_sequences_closed,
             updated_at = NOW()`,
          [
            c.userId,
            c.name,
            c.isWinner ? 1 : 0,
            c.sequencesClosed,
            c.isMvp ? 1 : 0,
            c.chipsPlaced,
            winningSeqInc,
          ],
        );
      } else {
        await pool.query(
          `INSERT INTO player_stats (
             name, total_wins, total_games, sequences_closed, mvp_games, chips_placed, winning_sequences_closed
           ) VALUES ($1, $2, 1, $3, $4, $5, $6)
           ON CONFLICT (name) DO UPDATE SET
             total_wins = player_stats.total_wins + EXCLUDED.total_wins,
             total_games = player_stats.total_games + 1,
             sequences_closed = player_stats.sequences_closed + EXCLUDED.sequences_closed,
             mvp_games = player_stats.mvp_games + EXCLUDED.mvp_games,
             chips_placed = player_stats.chips_placed + EXCLUDED.chips_placed,
             winning_sequences_closed = player_stats.winning_sequences_closed + EXCLUDED.winning_sequences_closed,
             updated_at = NOW()`,
          [
            c.name,
            c.isWinner ? 1 : 0,
            c.sequencesClosed,
            c.isMvp ? 1 : 0,
            c.chipsPlaced,
            winningSeqInc,
          ],
        );
      }
    }

    // Global team stats (wins + games only)
    for (const name of allTeamNames) {
      const isWinner = name === winningTeamName;
      await pool.query(
        `INSERT INTO team_stats (name, total_wins, total_games)
         VALUES ($1, $2, 1)
         ON CONFLICT (name) DO UPDATE SET
           total_wins = team_stats.total_wins + EXCLUDED.total_wins,
           total_games = team_stats.total_games + 1,
           updated_at = NOW()`,
        [name, isWinner ? 1 : 0],
      );
    }
  } catch (e) {
    console.warn("[db] persistWin failed:", (e as Error).message);
  }
}

interface PlayerTopRow {
  name: string;
  total_wins: number;
  total_games: number;
  sequences_closed: number;
  mvp_games: number;
  winning_sequences_closed: number;
  points: number;
  verified: boolean;
}
interface TeamTopRow {
  name: string;
  total_wins: number;
  total_games: number;
}

/**
 * Combined view: anonymous rows from player_stats + signed-in rows from user_stats.
 * Points are computed inline so we can tune the formula in one place.
 *   points = sequences_closed × 5 + winning_sequences_closed × 5 + mvp_games × 10
 */
const COMBINED_PLAYER_SQL = `
  SELECT name, total_wins, total_games, sequences_closed, mvp_games,
    winning_sequences_closed,
    (sequences_closed * 5 + winning_sequences_closed * 5 + mvp_games * 10) AS points,
    false AS verified
  FROM player_stats
  UNION ALL
  SELECT display_name AS name, total_wins, total_games, sequences_closed, mvp_games,
    winning_sequences_closed,
    (sequences_closed * 5 + winning_sequences_closed * 5 + mvp_games * 10) AS points,
    true AS verified
  FROM user_stats
`;

export async function getTopPlayersByPoints(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<PlayerTopRow>(
      `SELECT * FROM (${COMBINED_PLAYER_SQL}) c
       WHERE points > 0 OR total_games > 0
       ORDER BY points DESC, total_wins DESC, total_games ASC, name ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows.map(playerRowToEntry);
  } catch (e) {
    console.warn("[db] getTopPlayersByPoints failed:", (e as Error).message);
    return [];
  }
}

export async function getTopPlayers(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<PlayerTopRow>(
      `SELECT * FROM (${COMBINED_PLAYER_SQL}) c
       WHERE total_games > 0
       ORDER BY total_wins DESC, total_games ASC, name ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows.map(playerRowToEntry);
  } catch (e) {
    console.warn("[db] getTopPlayers failed:", (e as Error).message);
    return [];
  }
}

export async function getTopPlayersBySequences(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<PlayerTopRow>(
      `SELECT * FROM (${COMBINED_PLAYER_SQL}) c
       WHERE sequences_closed > 0
       ORDER BY sequences_closed DESC, total_games ASC, name ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows.map(playerRowToEntry);
  } catch (e) {
    console.warn("[db] getTopPlayersBySequences failed:", (e as Error).message);
    return [];
  }
}

export async function getTopPlayersByMvp(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<PlayerTopRow>(
      `SELECT * FROM (${COMBINED_PLAYER_SQL}) c
       WHERE mvp_games > 0
       ORDER BY mvp_games DESC, total_games ASC, name ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows.map(playerRowToEntry);
  } catch (e) {
    console.warn("[db] getTopPlayersByMvp failed:", (e as Error).message);
    return [];
  }
}

export async function getTopTeams(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<TeamTopRow>(
      `SELECT name, total_wins, total_games FROM team_stats
       WHERE total_games > 0
       ORDER BY total_wins DESC, total_games ASC, name ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows.map(teamRowToEntry);
  } catch (e) {
    console.warn("[db] getTopTeams failed:", (e as Error).message);
    return [];
  }
}

/** Paginated full ranking of players by points. */
export async function getPagedPlayersByPoints(perPage: number, page: number) {
  if (!pool) return { rows: [], total: 0, page, perPage };
  const offset = page * perPage;
  try {
    const [data, count] = await Promise.all([
      pool.query<PlayerTopRow>(
        `SELECT * FROM (${COMBINED_PLAYER_SQL}) c
         WHERE points > 0 OR total_games > 0
         ORDER BY points DESC, total_wins DESC, total_games ASC, name ASC
         LIMIT $1 OFFSET $2`,
        [perPage, offset],
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM (${COMBINED_PLAYER_SQL}) c
         WHERE points > 0 OR total_games > 0`,
      ),
    ]);
    return {
      rows: data.rows.map(playerRowToEntry),
      total: Number(count.rows[0]?.count ?? 0),
      page,
      perPage,
    };
  } catch (e) {
    console.warn("[db] getPagedPlayersByPoints failed:", (e as Error).message);
    return { rows: [], total: 0, page, perPage };
  }
}

/** Paginated full ranking of teams by wins. */
export async function getPagedTeams(perPage: number, page: number) {
  if (!pool) return { rows: [], total: 0, page, perPage };
  const offset = page * perPage;
  try {
    const [data, count] = await Promise.all([
      pool.query<TeamTopRow>(
        `SELECT name, total_wins, total_games FROM team_stats
         WHERE total_games > 0
         ORDER BY total_wins DESC, total_games ASC, name ASC
         LIMIT $1 OFFSET $2`,
        [perPage, offset],
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM team_stats WHERE total_games > 0`,
      ),
    ]);
    return {
      rows: data.rows.map(teamRowToEntry),
      total: Number(count.rows[0]?.count ?? 0),
      page,
      perPage,
    };
  } catch (e) {
    console.warn("[db] getPagedTeams failed:", (e as Error).message);
    return { rows: [], total: 0, page, perPage };
  }
}

function teamRowToEntry(row: TeamTopRow) {
  return {
    name: row.name,
    wins: Number(row.total_wins),
    games: Number(row.total_games),
    ratio: row.total_games > 0 ? Number(row.total_wins) / Number(row.total_games) : 0,
  };
}

function playerRowToEntry(r: PlayerTopRow) {
  return {
    name: r.name,
    wins: Number(r.total_wins),
    games: Number(r.total_games),
    ratio: r.total_games > 0 ? Number(r.total_wins) / Number(r.total_games) : 0,
    sequencesClosed: Number(r.sequences_closed),
    winningSequencesClosed: Number(r.winning_sequences_closed),
    mvpGames: Number(r.mvp_games),
    points: Number(r.points),
    verified: r.verified === true,
  };
}
