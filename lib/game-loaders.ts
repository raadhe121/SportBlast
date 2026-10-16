import type { GameModule } from "./game-contract";

// One lazy loader per game ID. Nothing here is fetched until a player opens the game.
// Every new game also gets an entry here, matching its entry in games.ts.
export const gameLoaders: Record<string, () => Promise<GameModule>> = {
  "car-racing": () => import("@/games/car-racing"),
  cricket: () => import("@/games/cricket"),
};
