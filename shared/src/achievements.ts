/**
 * Achievement catalog. Each achievement is a target threshold on a single
 * career stat that the server already tracks (player_stats / user_stats).
 * Earned + progress are derived client-side from a ScoreboardEntry so we
 * don't have to migrate the schema.
 */

import type { ScoreboardEntry } from "./protocol.js";

export type AchievementStatKey =
  | "games"
  | "wins"
  | "sequencesClosed"
  | "winningSequencesClosed"
  | "mvpGames"
  | "points";

export interface AchievementInfo {
  id: string;
  title: string;
  description: string;
  /** Small emoji glyph for the badge. */
  icon: string;
  statKey: AchievementStatKey;
  target: number;
  /** Higher = rarer (gold > silver > bronze, just for UI tinting). */
  tier: "bronze" | "silver" | "gold";
}

export const ACHIEVEMENTS: readonly AchievementInfo[] = [
  // Bronze — early-game milestones (low thresholds, hit within first session).
  { id: "first_step",  title: "First steps",         description: "Play your first game",                    icon: "🎬", statKey: "games",                  target: 1,   tier: "bronze" },
  { id: "first_win",   title: "First win",           description: "Win your first game",                     icon: "🏆", statKey: "wins",                   target: 1,   tier: "bronze" },
  { id: "first_seq",   title: "First sequence",      description: "Personally close your first sequence",    icon: "🎯", statKey: "sequencesClosed",        target: 1,   tier: "bronze" },
  { id: "mvp",         title: "MVP",                 description: "Earn MVP in any game",                    icon: "⭐", statKey: "mvpGames",               target: 1,   tier: "bronze" },
  { id: "practiced",   title: "Practiced",           description: "Play 5 games",                            icon: "🎲", statKey: "games",                  target: 5,   tier: "bronze" },
  { id: "heart",       title: "Heart of a Champion", description: "Win 3 games",                             icon: "💪", statKey: "wins",                   target: 3,   tier: "bronze" },

  // Silver — committed-player tier, a few sessions in.
  { id: "closer",      title: "The Closer",          description: "Close the winning sequence of a game",    icon: "💥", statKey: "winningSequencesClosed", target: 1,   tier: "silver" },
  { id: "veteran",     title: "Veteran",             description: "Play 10 games",                           icon: "🛡", statKey: "games",                  target: 10,  tier: "silver" },
  { id: "marksman",    title: "Marksman",            description: "Close 10 lifetime sequences",             icon: "🏹", statKey: "sequencesClosed",        target: 10,  tier: "silver" },
  { id: "champ",       title: "Champion",            description: "Win 5 games",                             icon: "👑", statKey: "wins",                   target: 5,   tier: "silver" },
  { id: "triple_mvp",  title: "Triple MVP",          description: "Earn MVP in 3 games",                     icon: "🌟", statKey: "mvpGames",               target: 3,   tier: "silver" },
  { id: "decisive",    title: "Decisive",            description: "Close 3 game-winning sequences",          icon: "⚡", statKey: "winningSequencesClosed", target: 3,   tier: "silver" },
  { id: "marathon",    title: "Marathon",            description: "Play 25 games",                           icon: "🏃", statKey: "games",                  target: 25,  tier: "silver" },

  // Gold — long-term mastery goals.
  { id: "legend",      title: "Legend",              description: "Win 20 games",                            icon: "🏅", statKey: "wins",                   target: 20,  tier: "gold"   },
  { id: "sharpshooter",title: "Sharpshooter",        description: "Close 25 lifetime sequences",             icon: "🎖", statKey: "sequencesClosed",        target: 25,  tier: "gold"   },
  { id: "centurion",   title: "Centurion",           description: "Reach 100 career points",                 icon: "💯", statKey: "points",                 target: 100, tier: "gold"   },
  { id: "game_ender",  title: "Game Ender",          description: "Close 10 game-winning sequences",         icon: "⚔",  statKey: "winningSequencesClosed", target: 10,  tier: "gold"   },
  { id: "mvp_master",  title: "MVP Master",          description: "Earn MVP in 10 games",                    icon: "🥇", statKey: "mvpGames",               target: 10,  tier: "gold"   },
  { id: "dedication",  title: "Dedication",          description: "Play 50 games",                           icon: "🌠", statKey: "games",                  target: 50,  tier: "gold"   },
  { id: "grandmaster", title: "Grandmaster",         description: "Reach 500 career points",                 icon: "🐉", statKey: "points",                 target: 500, tier: "gold"   },
] as const;

function statValue(entry: ScoreboardEntry, key: AchievementStatKey): number {
  switch (key) {
    case "games":                  return entry.games ?? 0;
    case "wins":                   return entry.wins ?? 0;
    case "sequencesClosed":        return entry.sequencesClosed ?? 0;
    case "winningSequencesClosed": return entry.winningSequencesClosed ?? 0;
    case "mvpGames":               return entry.mvpGames ?? 0;
    case "points":                 return entry.points ?? 0;
  }
}

export interface AchievementStatus {
  info: AchievementInfo;
  current: number;
  earned: boolean;
}

/** Compute all achievements with current progress for a given player entry. */
export function computeAchievements(entry: ScoreboardEntry): AchievementStatus[] {
  return ACHIEVEMENTS.map((info) => {
    const current = statValue(entry, info.statKey);
    return { info, current, earned: current >= info.target };
  });
}

/** Just the IDs of earned achievements, ordered by tier (gold > silver > bronze). */
export function earnedAchievementIds(entry: ScoreboardEntry): string[] {
  const tierRank = { gold: 0, silver: 1, bronze: 2 } as const;
  return computeAchievements(entry)
    .filter((a) => a.earned)
    .sort((a, b) => tierRank[a.info.tier] - tierRank[b.info.tier])
    .map((a) => a.info.id);
}
