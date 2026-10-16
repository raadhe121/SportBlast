import type { GameFactory } from "@/lib/game-contract";

// Highway Rush 3D. Three.js is only downloaded when the player opens this game.
const createGame: GameFactory = async (ctx) => {
  const { createHighway } = await import("./highway");
  return createHighway(ctx);
};

export default createGame;
