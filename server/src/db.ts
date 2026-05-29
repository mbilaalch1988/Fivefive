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

  pool = new pg.Pool({
    connectionString: url,
    // Supabase requires SSL but uses a CA the system might not trust.
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
  });

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

export async function persistWin(
  roomCode: string,
  winningTeam: "red" | "blue" | "green",
  winningPlayerNames: string[],
): Promise<void> {
  if (!pool) return;
  try {
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
  } catch (e) {
    console.warn("[db] persistWin failed:", (e as Error).message);
  }
}
