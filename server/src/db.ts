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

export interface WinRecord {
  roomCode: string;
  winningTeam: "red" | "blue" | "green";
  winningPlayerNames: string[];
  /** All player names who participated (winners + losers). */
  allPlayerNames: string[];
  /** Display names of every team that played this game (winners + losers). */
  allTeamNames: string[];
  /** Display name of the winning team. */
  winningTeamName: string;
}

export async function persistWin(record: WinRecord): Promise<void> {
  if (!pool) return;
  const {
    roomCode,
    winningTeam,
    winningPlayerNames,
    allPlayerNames,
    allTeamNames,
    winningTeamName,
  } = record;
  try {
    // Room-scoped (existing schema)
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

    // Global leaderboards
    for (const name of allPlayerNames) {
      const isWinner = winningPlayerNames.includes(name);
      await pool.query(
        `INSERT INTO player_stats (name, total_wins, total_games)
         VALUES ($1, $2, 1)
         ON CONFLICT (name) DO UPDATE SET
           total_wins = player_stats.total_wins + EXCLUDED.total_wins,
           total_games = player_stats.total_games + 1,
           updated_at = NOW()`,
        [name, isWinner ? 1 : 0],
      );
    }
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

interface TopRow {
  name: string;
  total_wins: number;
  total_games: number;
}

async function topFrom(table: "player_stats" | "team_stats", limit: number): Promise<TopRow[]> {
  if (!pool) return [];
  try {
    const r = await pool.query<TopRow>(
      `SELECT name, total_wins, total_games FROM ${table}
       WHERE total_games > 0
       ORDER BY total_wins DESC, total_games ASC, name ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows;
  } catch (e) {
    console.warn(`[db] top ${table} failed:`, (e as Error).message);
    return [];
  }
}

export async function getTopPlayers(limit: number) {
  return rowsToEntries(await topFrom("player_stats", limit));
}

export async function getTopTeams(limit: number) {
  return rowsToEntries(await topFrom("team_stats", limit));
}

function rowsToEntries(rows: TopRow[]) {
  return rows.map((r) => ({
    name: r.name,
    wins: Number(r.total_wins),
    games: Number(r.total_games),
    ratio: r.total_games > 0 ? Number(r.total_wins) / Number(r.total_games) : 0,
  }));
}
