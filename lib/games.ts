export type Orientation = "landscape" | "portrait";

export interface Game {
  id: string;
  title: string;
  description: string;
  orientation: Orientation;
}

// Every new game is just a new entry here.
export const games: Game[] = [
  {
    id: "car-racing",
    title: "Car Racing",
    description: "Dodge traffic and race to the finish line at top speed.",
    orientation: "landscape",
  },
  {
    id: "cricket",
    title: "Cricket",
    description: "Time your swing, hit boundaries and chase down the target.",
    orientation: "landscape",
  },
];
