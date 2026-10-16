// The five locations. Each sets the terrain (how curvy / hilly), the scenery and ground,
// which vehicles appear in traffic, and how much they honk.

export type Kind = "sedan" | "suv" | "truck" | "auto" | "bus";
export type PlaceId = "highway" | "india" | "mountain" | "desert" | "city";
export type SceneryKind = "forest" | "palms" | "alpine" | "desert" | "city";

export interface Place {
  id: PlaceId;
  name: string;
  curve: number; // peak road curvature, rad/m
  hill: number; // hill height, m
  warm: number; // hazy-orange sky tint 0..1
  cool: number; // blue-grey sky tint 0..1
  scenery: SceneryKind;
  ground: string; // ground colour
  hillColors: number[];
  hillH: [number, number];
  snow: boolean; // snow-capped distant mountains
  cliff: boolean; // rock wall along the left side of the road
  tunnels: boolean;
  bridges: boolean;
  mix: Record<Kind, number>; // relative frequency of each vehicle type in traffic
  honk: number; // how often traffic honks (1 = normal)
}

export const PLACES: Record<PlaceId, Place> = {
  highway: {
    id: "highway", name: "Highway", curve: 0.0016, hill: 4, warm: 0, cool: 0, scenery: "forest", ground: "#4d7c35",
    hillColors: [0x5f8f6a, 0x557f63, 0x6d9a73], hillH: [14, 42], snow: false, cliff: false, tunnels: false, bridges: false,
    mix: { sedan: 6, suv: 4, truck: 3, auto: 0, bus: 0 }, honk: 0.5
  },
  india: {
    id: "india", name: "India", curve: 0.0018, hill: 5, warm: 0.5, cool: 0, scenery: "palms", ground: "#8a8c48",
    hillColors: [0x8f9a5c, 0x7f8c52, 0x9aa465], hillH: [10, 30], snow: false, cliff: false, tunnels: false, bridges: false,
    mix: { sedan: 3, suv: 1.5, truck: 4, auto: 4, bus: 3 }, honk: 3
  },
  mountain: {
    id: "mountain", name: "Mountain", curve: 0.0055, hill: 14, warm: 0, cool: 0.6, scenery: "alpine", ground: "#5b6a52",
    hillColors: [0x6b7580, 0x5d6772, 0x7a8590], hillH: [60, 140], snow: true, cliff: true, tunnels: false, bridges: false,
    mix: { sedan: 2, suv: 4, truck: 3, auto: 0, bus: 1.5 }, honk: 0.7
  },
  desert: {
    id: "desert", name: "Desert", curve: 0.0014, hill: 8, warm: 0.7, cool: 0, scenery: "desert", ground: "#d2a96a",
    hillColors: [0xd9a864, 0xc99854, 0xe2b374], hillH: [14, 45], snow: false, cliff: false, tunnels: false, bridges: false,
    mix: { sedan: 2, suv: 3, truck: 4, auto: 0, bus: 0 }, honk: 0.4
  },
  city: {
    id: "city", name: "City", curve: 0.0012, hill: 3, warm: 0.1, cool: 0.2, scenery: "city", ground: "#70747a",
    hillColors: [0x8d9bb0, 0x7e8ca2, 0x9aa7ba], hillH: [18, 40], snow: false, cliff: false, tunnels: true, bridges: true,
    mix: { sedan: 5, suv: 3, truck: 1, auto: 0, bus: 3 }, honk: 1.5
  }
};
export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];
