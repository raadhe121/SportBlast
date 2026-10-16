export type CarKind = "sedan" | "coupe" | "suv";

export interface CarDef {
  name: string;
  kind: CarKind;
  color: number;
  blurb: string;
  speedMul: number; // multiplies the base cruising speed
  steer: number; // sideways acceleration (m/s²)
  drain: number; // nitro fuel used per second
  brake: number; // braking deceleration (m/s²)
  bars: [number, number, number]; // speed, handling, nitro (1–5) shown in the garage
}

export const CARS: CarDef[] = [
  { name: "Sprint", kind: "sedan", color: 0xff7a1a, blurb: "Balanced all-rounder", speedMul: 1.0, steer: 34, drain: 0.3, brake: 30, bars: [3, 3, 3] },
  { name: "Phantom", kind: "coupe", color: 0x2f6bff, blurb: "Fast and twitchy", speedMul: 1.06, steer: 38, drain: 0.38, brake: 32, bars: [5, 4, 2] },
  { name: "Bulldog", kind: "suv", color: 0xc6f432, blurb: "Big tank, lots of nitro", speedMul: 0.95, steer: 29, drain: 0.2, brake: 27, bars: [2, 2, 5] }
];
