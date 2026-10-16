// Best scores are stored on this device only (replaced by online saving in Phase 5).
const key = (gameId: string) => `game-hub:best:${gameId}`;

export function getBestScore(gameId: string): number {
  try {
    return Number(localStorage.getItem(key(gameId))) || 0;
  } catch {
    return 0;
  }
}

/** Saves the score if it beats the stored best. Returns whether it is a new best. */
export function submitScore(gameId: string, score: number): boolean {
  const best = getBestScore(gameId);
  if (score <= best) return false;
  try {
    localStorage.setItem(key(gameId), String(score));
  } catch {}
  return true;
}
