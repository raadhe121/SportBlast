// The contract every game follows. The hub gives a game a container element
// and a game-over callback; the game reports its final score and can be
// shut down cleanly with destroy().

/** Every game renders at this size; the hub scales it to fit the screen. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720; // 16:9 landscape

export interface GameContext {
  /** Screen area the game must render into. */
  container: HTMLElement;
  width: number;
  height: number;
  /**
   * Call exactly once when the round ends, with the final score.
   * A game can set the panel's heading and add a line of detail (for example "Destination reached!").
   */
  onGameOver: (score: number, info?: GameOverInfo) => void;
}

export interface GameOverInfo {
  title?: string; // defaults to "Game over"
  note?: string;
}

export interface GameInstance {
  /** Stop the game and release everything it created (canvas, listeners, timers). */
  destroy: () => void;
}

export type GameFactory = (ctx: GameContext) => GameInstance | Promise<GameInstance>;

/** What each game's module must default-export. */
export interface GameModule {
  default: GameFactory;
}
