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
  `);
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
  chipsPlaced: number;
  sequencesClosed: number;
  isWinner: boolean;
  isMvp: boolean;
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

    // Global player stats (rich)
    for (const c of contributions) {
      await pool.query(
        `INSERT INTO player_stats (
           name, total_wins, total_games, sequences_closed, mvp_games, chips_placed
         ) VALUES ($1, $2, 1, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET
           total_wins = player_stats.total_wins + EXCLUDED.total_wins,
           total_games = player_stats.total_games + 1,
           sequences_closed = player_stats.sequences_closed + EXCLUDED.sequences_closed,
           mvp_games = player_stats.mvp_games + EXCLUDED.mvp_games,
           chips_placed = player_stats.chips_placed + EXCLUDED.chips_placed,
           updated_at = NOW()`,
        [
          c.name,
          c.isWinner ? 1 : 0,
          c.sequencesClosed,
          c.isMvp ? 1 : 0,
          c.chipsPlaced,
        ],
      );
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
}
interface TeamTopRow {
  name: string;
  total_wins: number;
  total_games: number;
}

export async function getTopPlayers(limit: number) {
  if (!pool) return [];
  try {
    const r = await pool.query<PlayerTopRow>(
      `SELECT name, total_wins, total_games, sequences_closed, mvp_games
       FROM player_stats WHERE total_games > 0
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
      `SELECT name, total_wins, total_games, sequences_closed, mvp_games
       FROM player_stats WHERE sequences_closed > 0
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
      `SELECT name, total_wins, total_games, sequences_closed, mvp_games
       FROM player_stats WHERE mvp_games > 0
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
    return r.rows.map((row) => ({
      name: row.name,
      wins: Number(row.total_wins),
      games: Number(row.total_games),
      ratio: row.total_games > 0 ? Number(row.total_wins) / Number(row.total_games) : 0,
    }));
  } catch (e) {
    console.warn("[db] getTopTeams failed:", (e as Error).message);
    return [];
  }
}

function playerRowToEntry(r: PlayerTopRow) {
  return {
    name: r.name,
    wins: Number(r.total_wins),
    games: Number(r.total_games),
    ratio: r.total_games > 0 ? Number(r.total_wins) / Number(r.total_games) : 0,
    sequencesClosed: Number(r.sequences_closed),
    mvpGames: Number(r.mvp_games),
  };
}
