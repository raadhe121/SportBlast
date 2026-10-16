import * as THREE from "three";

// A "look" is the lighting and atmosphere for one combination of time of day and weather.

export type TimeOfDay = "day" | "sunset" | "night";
export type Weather = "clear" | "rain" | "fog" | "dust";

export interface Look {
  key: string;
  night: boolean; // dark enough for stars, moon and glowing lights
  lampsOn: boolean; // street lamps lit
  headlightsOn: boolean; // beams on the player's car
  rain: boolean; // falling rain, wet road, wipers
  dust: boolean; // blowing dust
  stars: boolean;
  moon: boolean;
  sky: [number, string][]; // gradient stops from the top of the sky to the horizon
  horizon: string;
  envLow: string; // colour of the ground in the reflection map
  fog: number; near: number; far: number;
  hemiSky: number; hemiGround: number; hemiInt: number;
  sunCol: number; sunInt: number; sunPos: [number, number, number]; // sun position relative to the player
  exposure: number; envInt: number;
}

const STOPS = [0, 0.28, 0.47, 0.5];
const SKY: Record<TimeOfDay, string[]> = {
  day: ["#2a62b8", "#4f8fdb", "#b9d7f1", "#d6e8f7"],
  sunset: ["#26356e", "#6a5aa0", "#f08a5d", "#ffc58c"],
  night: ["#03060f", "#08122a", "#0e1a3a", "#101a3c"]
};
const ENV_LOW: Record<TimeOfDay, string> = { day: "#566248", sunset: "#4a3a30", night: "#080c14" };
const FOG_TINT: Record<TimeOfDay, { fog: string; dust: string }> = {
  day: { fog: "#c9d0d6", dust: "#c79b5e" },
  sunset: { fog: "#d3b8a8", dust: "#b3703f" },
  night: { fog: "#1c2433", dust: "#2b2218" }
};
const BASE = {
  day: { near: 90, far: 470, hemiSky: 0xa9cdf2, hemiGround: 0x57703f, hemiInt: 0.75, sunCol: 0xfff1d8, sunInt: 1.7, sunPos: [-28, 52, 26] as [number, number, number], exposure: 1.0, envInt: 1 },
  sunset: { near: 80, far: 450, hemiSky: 0xf2b48a, hemiGround: 0x5a4636, hemiInt: 0.62, sunCol: 0xff9a5a, sunInt: 1.5, sunPos: [-60, 20, 40] as [number, number, number], exposure: 1.05, envInt: 0.8 },
  night: { near: 35, far: 340, hemiSky: 0x3a4f8a, hemiGround: 0x121a10, hemiInt: 0.38, sunCol: 0x9db6ff, sunInt: 0.65, sunPos: [-28, 52, 26] as [number, number, number], exposure: 1.25, envInt: 0.5 }
};

type C = string | number | THREE.Color;
const c = (h: C) => (h instanceof THREE.Color ? h.clone() : new THREE.Color(h as never));
const mix = (a: C, b: C, t: number) => c(a).lerp(c(b), t);
const grey = (col: THREE.Color) => { const l = col.r * 0.3 + col.g * 0.59 + col.b * 0.11; return new THREE.Color(l, l, l); };
const hex = (col: THREE.Color) => "#" + col.getHexString();

/** warm: 0..1 pushes the horizon towards a hazy orange (desert, India). cool: pushes it towards blue-grey (mountains). */
export function makeLook(time: TimeOfDay, weather: Weather, warm = 0, cool = 0): Look {
  const b = BASE[time];
  let sky = SKY[time].map(s => c(s));
  if (warm) sky = sky.map((s, i) => s.lerp(c(time === "night" ? "#2a2018" : "#f0c890"), warm * (0.15 + i * 0.12)));
  if (cool) sky = sky.map(s => s.lerp(c("#9fb4cc"), cool * 0.25));

  let near = b.near, far = b.far, hemiInt = b.hemiInt, sunInt = b.sunInt, envInt = b.envInt, exposure = b.exposure;
  let hemiSky: THREE.Color = c(b.hemiSky), sunCol: THREE.Color = c(b.sunCol);
  let envLow = c(ENV_LOW[time]);

  if (weather === "rain") {
    sky = sky.map(s => mix(s, grey(s), 0.7).multiplyScalar(time === "night" ? 0.8 : 0.82));
    near *= 0.35; far *= 0.64; sunInt *= 0.35; hemiInt *= 1.1; exposure *= 0.95; envInt *= 0.85;
    hemiSky = mix(hemiSky, grey(hemiSky), 0.5); envLow = envLow.multiplyScalar(0.85);
  } else if (weather === "fog") {
    const f = c(FOG_TINT[time].fog);
    sky = sky.map(s => s.clone().lerp(f, 0.88));
    near = 6; far = time === "night" ? 110 : 150; sunInt *= 0.45; hemiInt *= 1.15; envInt *= 0.6;
    hemiSky = mix(hemiSky, f, 0.6); envLow = mix(envLow, f, 0.5);
  } else if (weather === "dust") {
    const f = c(FOG_TINT[time].dust);
    sky = sky.map(s => s.clone().lerp(f, 0.8));
    near = 8; far = time === "night" ? 100 : 125; sunInt *= 0.5; hemiInt *= 0.95; envInt *= 0.6;
    hemiSky = mix(hemiSky, f, 0.55); sunCol = mix(sunCol, "#ffb060", 0.5); envLow = mix(envLow, f, 0.5);
  }
  const horizon = sky[3];
  const night = time === "night";
  const murky = weather === "fog" || weather === "dust";
  return {
    key: `${time}-${weather}-${warm.toFixed(2)}-${cool.toFixed(2)}`,
    night, lampsOn: night || time === "sunset" || murky,
    headlightsOn: night || time === "sunset" || murky,
    rain: weather === "rain", dust: weather === "dust",
    stars: night && weather === "clear", moon: night && weather === "clear",
    sky: sky.map((s, i) => [STOPS[i], hex(s)] as [number, string]),
    horizon: hex(horizon), envLow: hex(envLow),
    fog: horizon.getHex(), near, far,
    hemiSky: hemiSky.getHex(), hemiGround: b.hemiGround, hemiInt,
    sunCol: sunCol.getHex(), sunInt, sunPos: b.sunPos, exposure, envInt
  };
}
