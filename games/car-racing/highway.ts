import * as THREE from "three";
import type { GameContext, GameInstance, GameOverInfo } from "@/lib/game-contract";
import { CARS, type CarKind } from "./cars";
import { Sound } from "./sound";
import { CSS, HTML, ensureFonts } from "./highway-ui";
import { createVehicleKit, type Vehicle } from "./vehicles";
import { createScenery, consolidate } from "./scenery";
import { SpritePool, SkidMarks, MotionBlur } from "./effects";
import { createJunctionKit } from "./junction";
import { Destination } from "./destination";
import { Bend, makeTerrain, type Terrain } from "./bend";
import { makeLook, type Look, type TimeOfDay, type Weather } from "./look";
import { PLACES, PLACE_IDS, type PlaceId, type Kind } from "./places";

// "Highway Rush 3D": endless highway racer, rendered with Three.js into the hub's game area.
// Units are metres and metres/second internally; the HUD shows km/h.
// Options (chosen on the start screen): garage car, day/night, clear/rain, one-way/two-way traffic.

// Test flags in the page URL. They only work in development builds, never in production.
const DEV = process.env.NODE_ENV !== "production";
const SKIPJ = DEV && typeof location !== "undefined" ? Number(/[?&]skipj=(\d+)/.exec(location.search)?.[1] || 0) : 0; // start this many metres before the first junction
const AUTOPILOT = DEV && typeof location !== "undefined" && /[?&]autopilot/.test(location.search); // drives the recommended route by itself
const INVINCIBLE = DEV && typeof location !== "undefined" && /[?&]invincible/.test(location.search); // cars pass through each other
const SKIP = DEV && typeof location !== "undefined" ? Number(/[?&]skip=(\d+)/.exec(location.search)?.[1] || 0) : 0; // start this many metres down the road
const TESTHIT = DEV && typeof location !== "undefined" && /[?&]testhit/.test(location.search); // slow cars keep appearing in the player's lane
let audioUnlocked = false; // once the player has pressed Start, "Play again" starts straight away

/* ---------- saved options ---------- */
interface Settings { car: number; time: TimeOfDay; weather: Weather; place: PlaceId; twoWay: boolean; mode: "free" | "destination" }
const TIMES: TimeOfDay[] = ["day", "sunset", "night"];
const WEATHERS: Weather[] = ["clear", "rain", "fog", "dust"];
const SETTINGS_KEY = "highway-rush-3d:settings";
function loadSettings(): Settings {
  const s: Settings = { car: 0, time: "day", weather: "clear", place: "highway", twoWay: false, mode: "free" };
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (Number.isInteger(o.car) && o.car >= 0 && o.car < CARS.length) s.car = o.car;
    if (TIMES.includes(o.time)) s.time = o.time; else if (o.night === true) s.time = "night"; // older saves
    if (WEATHERS.includes(o.weather)) s.weather = o.weather; else if (o.rain === true) s.weather = "rain";
    if (PLACE_IDS.includes(o.place)) s.place = o.place;
    s.twoWay = o.twoWay === true;
    s.mode = o.mode === "destination" ? "destination" : "free";
  } catch { /* storage unavailable */ }
  return s;
}
const settings = loadSettings();
const destMode = () => settings.mode === "destination";
const twoWayNow = () => settings.twoWay && !destMode(); // destination mode is always one-way
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

/* ---------- constants & helpers ---------- */
const LANES = [-5.4, -1.8, 1.8, 5.4]; // same-direction lanes (ids 0-3)
const ONC = [-9.0, -12.6]; // oncoming lanes (ids 4-5), only on two-way roads
const laneX = (id: number) => (id < 4 ? LANES[id] : ONC[id - 4]);
const SEG_LEN = 40;
const SEG_COUNT = 12;
const TEX_R = 8.6; // road texture right edge
const RAIL_R = 8.2;
const X_MAX = 7.3;
const GEAR_MAX = [45, 80, 115, 150, 190, 320]; // km/h at the top of each of the 6 gears

interface RoadLayout { twoWay: boolean; texL: number; railL: number; xMin: number; texW: number }
const LAYOUT_ONE: RoadLayout = { twoWay: false, texL: -8.6, railL: 8.2, xMin: -7.3, texW: 512 };
const LAYOUT_TWO: RoadLayout = { twoWay: true, texL: -16.8, railL: 15.4, xMin: -14.5, texW: 768 };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const col = (h: number) => new THREE.Color(h).convertSRGBToLinear(); // colours are authored in sRGB

interface Traffic extends Vehicle {
  kind: Kind; oncoming: boolean; dir: 1 | -1; // dir 1 drives the same way as the player
  glowsFront: THREE.Sprite[]; glowsRear: THREE.Sprite[]; sign?: THREE.Mesh;
  ind: THREE.Mesh[][]; // indicator lights: [left, right], each at the front and back
  signalT: number; signalDir: number; pendingLane: number; // indicating before a lane change
  brakeT: number; honkCd: number; prevSpeed: number; // sudden braking, honking, brake lights
  active: boolean; lane: number; targetLane: number; x: number; z: number;
  speed: number; baseSpeed: number; changeT: number; gap: number; awarded: boolean; inZone: boolean; lat: number;
}
type Control = "left" | "right" | "nitro" | "brake";

const SPEEDS_SAME: Record<Kind, [number, number]> = { sedan: [19, 25], suv: [17, 23], truck: [12.5, 16.5], auto: [11, 15], bus: [15, 19.5] };
const SPEEDS_ONC: Record<Kind, [number, number]> = { sedan: [20, 26], suv: [18, 24], truck: [14, 18], auto: [12, 16], bus: [16, 21] };
const CAR_COLORS = [0xe9e9ec, 0x17181b, 0xaeb4ba, 0x5d636a, 0xa3262c, 0x2b4f8f, 0x2f5b45, 0xc8b48c, 0xd8b22d, 0x6a2b7a, 0x1f6f78];
const CAB_COLORS = [0xa3262c, 0x2b4f8f, 0xe9e9ec, 0x17181b, 0x2f5b45, 0xc8b48c];
const HONK_PITCH: Record<Kind, number> = { sedan: 430, suv: 380, truck: 250, bus: 290, auto: 560 };
const AUTO_COLORS = [[0x1f7a3d, 0xf2c200], [0xf2c200, 0x1f7a3d], [0x15161a, 0xf2c200]];
const BUS_COLORS = [0xc0392b, 0x2b4f8f, 0x2f6b4f, 0xd8861b];
const BRIGHT = [0xe76f51, 0x2a9d8f, 0xf4a261, 0x3a86ff, 0xd62828, 0xf2c200];
const TRAILER_COLORS = [0xe9e9ec, 0xc9ced3, 0x3f5f8a, 0x8d2b2f, 0x2f6b4f, 0xd8d3c6];

/* ---------- looks: time of day x weather x location ---------- */
function lookOf(): Look {
  const p = PLACES[settings.place];
  return makeLook(settings.time, settings.weather, p.warm, p.cool);
}

/* ======================================================================== */
export function createHighway({ container, onGameOver }: GameContext): GameInstance {
  const root = document.createElement("div");
  root.className = "hr3d";
  root.innerHTML = HTML;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  ensureFonts();
  container.appendChild(root);
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const isTouch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  if (isTouch) root.classList.add("touch");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    if (!renderer.getContext()) throw new Error("no webgl context");
  } catch {
    root.classList.add("nogl");
    q("#start").classList.add("hidden");
    return { destroy: () => { root.remove(); style.remove(); } };
  }

  const size = () => ({ w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(size().w, size().h, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.insertBefore(renderer.domElement, root.firstChild);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(col(0xd6e8f7), 90, 470);
  const camera = new THREE.PerspectiveCamera(60, size().w / size().h, 0.3, 1400);
  scene.add(camera);

  const bend = new Bend();
  let terrain: Terrain = makeTerrain(PLACES[settings.place].curve, PLACES[settings.place].hill);
  const textures: THREE.Texture[] = [];
  function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d")!, w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.push(t);
    return t;
  }
  function addNoise(g: CanvasRenderingContext2D, w: number, h: number, amt: number) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }
  const disposeTree = (o: THREE.Object3D) => o.traverse(c => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach(x => x.dispose());
  });
  // soft round blob, used for lamp light pools, headlight glows and the moon halo
  const radialTex = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.33)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });

  /* ---------- sky, moon, reflections ---------- */
  const skyCache = new Map<string, THREE.Texture>();
  function skyTexture(L: Look, env: boolean) {
    const id = L.key + (env ? "-env" : "");
    let t = skyCache.get(id);
    if (!t) {
      const starry = L.stars && !env; // fine stars need a wider texture
      t = canvasTex(starry ? 2048 : 512, starry ? 512 : 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        for (const [p, c] of L.sky) gr.addColorStop(p, c);
        const low = env ? L.envLow : L.horizon;
        gr.addColorStop(0.5001, low); gr.addColorStop(1, low);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        if (starry) {
          for (let i = 0; i < 700; i++) {
            g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.9)})`;
            g.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h * 0.46), 1, 1);
          }
        }
      });
      skyCache.set(id, t);
    }
    return t;
  }
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.material.userData.noBend = true;
  sky.renderOrder = -10;
  scene.add(sky);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: col(0xeef2ff), fog: false }));
  moon.position.set(-380, 170, -780);
  moon.material.userData.noBend = true;
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: col(0x9db6ff), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45, fog: false }));
  moonHalo.scale.set(220, 220, 1); moonHalo.position.copy(moon.position); moonHalo.material.userData.noBend = true;
  sky.add(moon, moonHalo);

  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = new Map<string, THREE.Texture>();
  function envFor(L: Look) {
    let t = envCache.get(L.key);
    if (!t) {
      const m = envSky.material as THREE.MeshBasicMaterial;
      m.map = skyTexture(L, true); m.needsUpdate = true;
      t = pmrem.fromScene(envScene, 0.02).texture; // reflections for the glossy paint and the wet road
      envCache.set(L.key, t);
    }
    return t;
  }

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight(col(0xa9cdf2), col(0x57703f), 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(col(0xfff1d8), 1.7); // the sun by day, the moon by night
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // headlights: two spot lights that ride on the player's car (night only)
  const headlights = new THREE.Group();
  for (const s of [-1, 1]) {
    const spot = new THREE.SpotLight(col(0xfff0d0), 4.5, 100, 0.45, 0.5, 1.0);
    spot.position.set(s * 0.62, 0, 0);
    spot.target.position.set(s * 0.62, -0.7, -45);
    headlights.add(spot, spot.target);
  }
  headlights.visible = false;

  /* ---------- ground & road ---------- */
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#4d7c35"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const l = rnd(-18, 18);
      g.fillStyle = `rgb(${(77 + l) | 0},${(124 + l * 1.4) | 0},${(53 + l * 0.5) | 0})`;
      g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 5));
    }
    addNoise(g, w, h, 16);
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(200, 200);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(800, 800, 8, 200), new THREE.MeshLambertMaterial({ map: grassTex }));
  grass.frustumCulled = false;
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.14; grass.receiveShadow = true;
  scene.add(grass);

  const allLanes = (L: RoadLayout) => (L.twoWay ? [...LANES, ...ONC] : LANES);
  const roadCache = new Map<boolean, { map: THREE.Texture; rough: THREE.Texture }>();
  function roadAssets(L: RoadLayout) {
    let a = roadCache.get(L.twoWay);
    if (a) return a;
    const W = L.texW, H = 1024, ppm = W / (TEX_R - L.texL), X = (m: number) => (m - L.texL) * ppm;
    const leftEdge = L.twoWay ? -14.4 : -7.2;
    const map = canvasTex(W, H, g => {
      g.fillStyle = "#3a3d43"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#45484d"; g.fillRect(0, 0, X(leftEdge), H); g.fillRect(X(7.2), 0, W - X(7.2), H); // shoulders
      for (let i = 0; i < 90; i++) { // faint patches (drawn again one tile up/down so the texture tiles without seams)
        g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.025)";
        const px0 = Math.random() * W, py0 = Math.random() * H, pw = rnd(20, 120), ph = rnd(20, 160);
        for (const dy of [0, -H, H]) g.fillRect(px0, py0 + dy, pw, ph);
      }
      for (const lc of allLanes(L)) for (const off of [-0.8, 0.8]) { // tyre wear marks
        const x = X(lc + off), hw = 0.42 * ppm, gr = g.createLinearGradient(x - hw, 0, x + hw, 0);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, "rgba(0,0,0,.2)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x - hw, 0, hw * 2, H);
      }
      const lw = 0.16 * ppm;
      g.fillStyle = "rgba(238,238,232,.96)";
      for (const e of [L.twoWay ? -14.2 : -7.0, 7.0]) g.fillRect(X(e) - lw / 2, 0, lw, H); // solid edge lines
      const dashed = L.twoWay ? [-10.8, -3.6, 0, 3.6] : [-3.6, 0, 3.6];
      for (const lx of dashed) for (let y = 0; y < H; y += 256) g.fillRect(X(lx) - lw / 2, y + 20, lw, 77); // dashed lane lines
      if (L.twoWay) { // double yellow centre line
        g.fillStyle = "rgba(242,196,38,.96)";
        for (const o of [-0.16, 0.16]) g.fillRect(X(-7.2 + o) - lw / 2, 0, lw, H);
      }
      addNoise(g, W, H, 24);
    });
    const rough = canvasTex(W, H, g => { // wet-road roughness: dark = shiny puddles (the green channel is used)
      g.fillStyle = "rgb(205,205,205)"; g.fillRect(0, 0, W, H);
      for (const lc of allLanes(L)) for (const off of [-0.8, 0.8]) {
        const x = X(lc + off), hw = 0.4 * ppm, gr = g.createLinearGradient(x - hw, 0, x + hw, 0);
        gr.addColorStop(0, "rgba(110,110,110,0)"); gr.addColorStop(0.5, "rgba(110,110,110,.7)"); gr.addColorStop(1, "rgba(110,110,110,0)");
        g.fillStyle = gr; g.fillRect(x - hw, 0, hw * 2, H);
      }
      for (let i = 0; i < 110; i++) {
        const cx = X(rnd(L.twoWay ? -14 : -7, 7)), cy = Math.random() * H, sx = rnd(10, 40), sy = rnd(30, 150);
        for (const dy of [0, -H, H]) { // wrapped copies so puddles are not cut at the tile edge
          g.save(); g.translate(cx, cy + dy); g.scale(sx, sy);
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
          gr.addColorStop(0, "rgba(20,20,20,.95)"); gr.addColorStop(0.7, "rgba(20,20,20,.6)"); gr.addColorStop(1, "rgba(20,20,20,0)");
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
        }
      }
      addNoise(g, W, H, 22);
    }, false);
    map.wrapT = rough.wrapT = THREE.RepeatWrapping; // crossing roads repeat the texture along their length
    a = { map, rough };
    roadCache.set(L.twoWay, a);
    return a;
  }

  const poolMat = new THREE.MeshBasicMaterial({ map: radialTex, color: col(0xffd69a), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const haloMat = new THREE.SpriteMaterial({ map: radialTex, color: col(0xffe2ad), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8, fog: false, sizeAttenuation: false });
  const railMat = new THREE.MeshStandardMaterial({ color: col(0xb4bcc4), metalness: 0.75, roughness: 0.38 });
  const postMat = new THREE.MeshLambertMaterial({ color: col(0x6c7178) });
  const poleMat = new THREE.MeshStandardMaterial({ color: col(0x5d646c), metalness: 0.6, roughness: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: col(0xfff2c4) });
  const railGeo = new THREE.BoxGeometry(0.09, 0.3, SEG_LEN, 1, 1, 10);
  const railLowGeo = new THREE.BoxGeometry(0.07, 0.12, SEG_LEN, 1, 1, 10);
  const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 7.6, 8);
  const armGeo = new THREE.BoxGeometry(2.4, 0.09, 0.09);
  const lampGeo = new THREE.BoxGeometry(0.8, 0.12, 0.32);
  const poolGeo = new THREE.PlaneGeometry(9, 15).rotateX(-Math.PI / 2);

  const roadGroup = new THREE.Group();
  scene.add(roadGroup);
  const bridgeGroup = new THREE.Group();
  scene.add(bridgeGroup);
  const kits = [createJunctionKit(canvasTex, col), createJunctionKit(canvasTex, col)]; // the junction ahead and the one just passed
  kits.forEach(k => scene.add(k.group));
  let layout = twoWayNow() ? LAYOUT_TWO : LAYOUT_ONE;
  // Bent geometry can't be frustum-culled, so shadow casters are switched off by hand unless they're near the player.
  const casters = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
  function trackCasters(o: THREE.Object3D) { const l: THREE.Mesh[] = []; o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh && m.castShadow) l.push(m); }); casters.set(o, l); }
  function setCasting(o: THREE.Object3D, on: boolean) { const l = casters.get(o); if (l) for (const m of l) m.castShadow = on; }
  interface Seg { g: THREE.Group; z: number; k: number; lamp: THREE.Group; pool: THREE.Mesh; halo: THREE.Sprite; tunnel: THREE.Group; tunnelOn: boolean; rails: THREE.Object3D; posts: THREE.Object3D }
  let segments: Seg[] = [];
  let bridges: { g: THREE.Group; z: number }[] = [];
  let roadMat!: THREE.MeshPhysicalMaterial;
  let assets = roadAssets(layout);
  const dummy = new THREE.Object3D();
  const rockMat = new THREE.MeshPhongMaterial({ color: col(0x6f757c), flatShading: true, specular: 0x000000, shininess: 0 });
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const concreteMat = new THREE.MeshLambertMaterial({ color: col(0x8a8f96) });
  const tunnelMat = new THREE.MeshBasicMaterial({ color: col(0x30343a) });
  const stripMat = new THREE.MeshBasicMaterial({ color: col(0xfff2c4) });
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
  const tunnelGlowMat = new THREE.MeshBasicMaterial({ map: radialTex, color: col(0xffe0a0), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const kOf = (z: number) => Math.round((40 - z) / SEG_LEN); // which 40 m piece of the road a z position belongs to
  const tunnelAt = (k: number) => k >= 24 && (k - 24) % 44 < 8; // an 320 m tunnel every ~1.8 km (city only)

  /** Show or hide a road piece's tunnel, lamp and light pool, depending on where it now is. */
  function updateSeg(s: Seg) {
    s.k = kOf(s.z);
    s.tunnelOn = PLACES[settings.place].tunnels && !destMode() && tunnelAt(s.k);
    // near a crossroads the guardrails and lamps are left out so the side roads can join
    const open = destMode() && (Math.abs(s.z - jz) < 29 || Math.abs(s.z - jzPrev) < 29);
    s.tunnel.visible = s.tunnelOn;
    s.rails.visible = s.posts.visible = !open;
    s.lamp.visible = !s.tunnelOn && !open;
    s.pool.visible = s.halo.visible = look.lampsOn && !s.tunnelOn && !open;
  }

  function buildRoad(twoWay: boolean) {
    roadGroup.children.forEach(c => c.traverse(o => { (o as THREE.Mesh).geometry?.dispose?.(); }));
    roadMat?.dispose();
    roadGroup.clear();
    layout = twoWay ? LAYOUT_TWO : LAYOUT_ONE;
    assets = roadAssets(layout);
    segments = [];
    const P = PLACES[settings.place];
    roadMat = new THREE.MeshPhysicalMaterial({ map: assets.map, roughness: 0.92, metalness: 0, reflectivity: 0.5 });
    const roadGeo = new THREE.PlaneGeometry(TEX_R - layout.texL, SEG_LEN, 1, 10);
    const span = layout.railL + RAIL_R + 2.8, midX = (RAIL_R - layout.railL) / 2;
    const ceilGeo = new THREE.BoxGeometry(span, 0.6, SEG_LEN, 1, 1, 10), wallGeo = new THREE.BoxGeometry(0.8, 6.8, SEG_LEN, 1, 1, 10);
    const stripGeo = new THREE.BoxGeometry(0.35, 0.1, SEG_LEN - 1.5, 1, 1, 10);
    const shadeGeo = new THREE.PlaneGeometry(span, SEG_LEN, 1, 10).rotateX(-Math.PI / 2), glowGeo = new THREE.PlaneGeometry(span, SEG_LEN).rotateX(-Math.PI / 2);
    for (let i = 0; i < SEG_COUNT; i++) {
      const g = new THREE.Group();
      const road = new THREE.Mesh(roadGeo, roadMat);
      road.rotation.x = -Math.PI / 2; road.position.x = (layout.texL + TEX_R) / 2; road.receiveShadow = true; g.add(road);
      const posts = new THREE.InstancedMesh(postGeo, postMat, 20);
      const rails = new THREE.Group();
      let n = 0;
      for (const side of [-1, 1]) {
        const rx = side * (side < 0 ? layout.railL : RAIL_R);
        const beam = new THREE.Mesh(railGeo, railMat); beam.position.set(rx, 0.66, 0); rails.add(beam);
        const low = new THREE.Mesh(railLowGeo, railMat); low.position.set(rx, 0.4, 0); rails.add(low);
        for (let k = 0; k < 10; k++) { dummy.position.set(rx + side * 0.12, 0.4, -18 + k * 4); dummy.updateMatrix(); posts.setMatrixAt(n++, dummy.matrix); }
      }
      const railsMesh = consolidate(rails);
      g.add(railsMesh, posts); // both guardrails are one draw call
      const side = i % 2 ? 1 : -1, lx = side * ((side < 0 ? layout.railL : RAIL_R) + 0.9); // a street lamp every 40 m, alternating sides
      const lampParts = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(lx, 3.8, 0); lampParts.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(lx - side * 1.2, 7.55, 0); lampParts.add(arm);
      const head = new THREE.Mesh(lampGeo, lampMat); head.position.set(lx - side * 2.3, 7.45, 0); lampParts.add(head);
      const lamp = consolidate(lampParts); // pole and arm are one mesh, the glowing head another
      g.add(lamp);
      const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(lx - side * 2.3, 0.05, 0); pool.renderOrder = 2; g.add(pool);
      const halo = new THREE.Sprite(haloMat); halo.scale.set(0.085, 0.085, 1); halo.position.set(lx - side * 2.3, 7.4, 0); g.add(halo);
      if (P.cliff) { // mountain: a rock wall along the left of the road
        const r = new THREE.Mesh(rockGeo, rockMat);
        r.scale.set(rnd(4, 6), rnd(6, 10), rnd(12, 20)); r.position.set(-(layout.railL + 7 + rnd(0, 3)), r.scale.y * 0.3, rnd(-8, 8)); r.rotation.y = rnd(0, 3); r.castShadow = true; g.add(r);
      }
      // tunnel (city): a lit tube over the road, only shown on the pieces that fall inside a tunnel
      const tunnel = new THREE.Group(); tunnel.visible = false;
      const ceil = new THREE.Mesh(ceilGeo, tunnelMat); ceil.position.set(midX, 6.7, 0); tunnel.add(ceil);
      for (const wx of [-(layout.railL + 0.7), RAIL_R + 0.7]) { const w = new THREE.Mesh(wallGeo, tunnelMat); w.position.set(wx, 3.4, 0); tunnel.add(w); }
      for (const sx of twoWay ? [-10.8, -1.8, 1.8] : [-1.8, 1.8]) { const st = new THREE.Mesh(stripGeo, stripMat); st.position.set(sx, 6.35, 0); tunnel.add(st); }
      const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.set(midX, 0.035, 0); shade.renderOrder = 1; tunnel.add(shade);
      const tg = new THREE.Mesh(glowGeo, tunnelGlowMat); tg.position.set(midX, 0.05, 0); tg.renderOrder = 2; tunnel.add(tg);
      g.add(tunnel);
      g.traverse(o => { o.frustumCulled = false; }); // bent geometry can leave its straight-road bounding box
      roadGroup.add(g);
      trackCasters(g);
      const seg: Seg = { g, z: 40 - i * SEG_LEN, k: 0, lamp, pool, halo, tunnel, tunnelOn: false, rails: railsMesh, posts };
      segments.push(seg);
      updateSeg(seg);
    }
    bend.patchAll(roadGroup);
    kits.forEach(k => k.setRoadMaterial(roadMat));
    buildBridges();
  }

  /** Road bridges (city): a deck over the whole road, repeated every ~500 m. */
  function buildBridges() {
    bridgeGroup.children.forEach(c => c.traverse(o => { (o as THREE.Mesh).geometry?.dispose?.(); }));
    bridgeGroup.clear(); bridges = [];
    if (!PLACES[settings.place].bridges || destMode()) return;
    const w = layout.railL + RAIL_R + 14, midX = (RAIL_R - layout.railL) / 2;
    const deck = new THREE.BoxGeometry(w, 1.1, 14, 1, 1, 3), parapet = new THREE.BoxGeometry(w, 0.7, 0.35), pillar = new THREE.BoxGeometry(1.8, 6.9, 5);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const d = new THREE.Mesh(deck, concreteMat); d.position.set(midX, 6.9, 0); d.castShadow = d.receiveShadow = true; g.add(d);
      for (const z of [-6.8, 6.8]) { const pr = new THREE.Mesh(parapet, concreteMat); pr.position.set(midX, 7.8, z); g.add(pr); }
      for (const x of [-(layout.railL + 4), RAIL_R + 4]) { const pl = new THREE.Mesh(pillar, concreteMat); pl.position.set(x, 3.45, 0); pl.castShadow = true; g.add(pl); }
      g.traverse(o => { o.frustumCulled = false; });
      trackCasters(g); bridgeGroup.add(g); bridges.push({ g, z: pz - 260 - i * 520 });
    }
    bend.patchAll(bridgeGroup);
  }

  /* ---------- scenery, hills and ground for the chosen location ---------- */
  const scen = createScenery(canvasTex, col);
  let trees: THREE.Group[] = [];
  let hills: { m: THREE.Mesh; side: number }[] = [];
  const placeTree = (t: THREE.Group, z: number) => {
    if (destMode()) for (const j of [jz, jzPrev]) if (Math.abs(z - j) < 16) z += z > j ? 22 : -22; // keep the crossing roads clear
    const P = PLACES[settings.place], left = Math.random() < 0.5; // keep clear of the guardrails on whichever side is wider
    const near = t.userData.faceRoad; // signs and shops stand close to the road, facing it
    const margin = near ? 4 : P.scenery === "city" ? 13 : 3, spread = near ? 6 : P.scenery === "city" ? 34 : 40;
    const cliff = P.cliff && left && !near ? 14 : 0;
    t.position.set(left ? -(layout.railL + margin + cliff + rnd(0, spread)) : RAIL_R + margin + rnd(0, spread), -0.05, z);
    t.rotation.y = near ? (left ? Math.PI / 2 : -Math.PI / 2) : rnd(0, 6.28);
  };
  function buildPlaceVisuals() {
    const P = PLACES[settings.place];
    const gm = grass.material as THREE.MeshLambertMaterial;
    gm.map = scen.groundTexture(P); gm.needsUpdate = true;
    for (const t of trees) scene.remove(t);
    trees = [];
    for (let i = 0; i < 56; i++) { const t = scen.make(P.scenery); t.traverse(o => { o.frustumCulled = false; }); scene.add(t); bend.patchAll(t); trackCasters(t); trees.push(t); }
    for (const h of hills) { scene.remove(h.m); h.m.geometry.dispose(); }
    hills = [];
    for (let i = 0; i < 12; i++) {
      const m = scen.makeHill(P), sy = rnd(P.hillH[0], P.hillH[1]), side = i % 2 ? 1 : -1, wide = sy > 55 ? 1.7 : 1;
      m.scale.set(rnd(60, 120) * wide, sy, rnd(70, 120) * wide); m.rotation.y = rnd(0, 3);
      m.position.set(side * rnd(190, 340), -sy * 0.32, -i * 60 + 100);
      m.frustumCulled = false; scene.add(m); bend.patchAll(m); hills.push({ m, side });
    }
    scen.setNight(look.night);
  }

  /* ---------- rain & dust ---------- */
  const RAIN_N = 1400;
  const rainPos = new Float32Array(RAIN_N * 6);
  const rainHead = new Float32Array(RAIN_N * 3); // drop positions, relative to the camera
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd0e8, transparent: true, opacity: 0.42, depthWrite: false, fog: false });
  rainMat.userData.noBend = true;
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);
  for (let i = 0; i < RAIN_N; i++) { rainHead[i * 3] = rnd(-18, 18); rainHead[i * 3 + 1] = rnd(-3.6, 14); rainHead[i * 3 + 2] = rnd(-50, 8); }
  // rain falls; dust is blown sideways across the road
  function updateRain(dt: number, spd: number) {
    const dust = look.dust, vx = dust ? 36 : 0, vy = dust ? -1.5 : -38;
    for (let i = 0; i < RAIN_N; i++) {
      const o3 = i * 3, o = i * 6;
      let x = rainHead[o3] + vx * dt, y = rainHead[o3 + 1] + vy * dt, z = rainHead[o3 + 2] + spd * dt * 0.85;
      if (dust ? x > 20 || z > 8 : y < -3.6 || z > 8) {
        if (dust) { x = rnd(-20, -6); y = rnd(-3.2, 8); z = rnd(-55, 8); }
        else { x = rnd(-18, 18); y = rnd(8, 15); z = rnd(-52, -8); }
      }
      rainHead[o3] = x; rainHead[o3 + 1] = y; rainHead[o3 + 2] = z;
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
      if (dust) { rainPos[o + 3] = x - 2.4; rainPos[o + 4] = y; rainPos[o + 5] = z - spd * 0.02; }
      else { rainPos[o + 3] = x; rainPos[o + 4] = y + 0.55; rainPos[o + 5] = z - spd * 0.014; } // streak leans back along the car's motion
    }
    (rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    rain.position.copy(camera.position);
  }

  /* ---------- tyre smoke, sparks, skid marks, motion blur ---------- */
  const smoke = new SpritePool(radialTex, 70, THREE.NormalBlending, 0xcfd3d8);
  const sparks = new SpritePool(radialTex, 90, THREE.AdditiveBlending, 0xffb347, 14);
  const soot = new SpritePool(radialTex, 40, THREE.NormalBlending, 0x2b2b2b); // dark smoke from a damaged engine
  const glass = new SpritePool(radialTex, 40, THREE.NormalBlending, 0xdff0ff, 9); // glass shards
  const skid = new SkidMarks();
  scene.add(smoke.group, sparks.group, soot.group, glass.group, skid.mesh);
  if (INVINCIBLE) renderer.info.autoReset = false;
  const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const fx = new MotionBlur(renderer, drawSize.x, drawSize.y);
  let blurS = 0, smokeAcc = 0, skidDist = 0;
  const tmpV = new THREE.Vector3();
  const speedfxEl = q("#speedfx");

  /* ---------- vehicles ---------- */
  const kit = createVehicleKit(canvasTex, col, radialTex);
  const { buildCar, buildTruck, buildAuto, buildBus, addHornSign, dentCar, repairCar, setCracks, glow, glowMat, sharedHeadGlow, sharedTailGlow } = kit;

  // the garage: one player car per entry in CARS, only the chosen one is visible
  const players: Vehicle[] = CARS.map(c => {
    const v = buildCar(c.kind, c.color, true);
    v.root.visible = false; scene.add(v.root);
    return v;
  });
  let player = players[settings.car];
  let cur = CARS[settings.car];
  player.root.visible = true;
  function mountHeadlights() {
    player.root.add(headlights);
    headlights.position.set(0, player.ly + 0.1, -(player.hl - 0.1));
  }
  mountHeadlights();

  const traffic: Traffic[] = [];
  const indGeo = new THREE.BoxGeometry(0.2, 0.11, 0.05), indMat = new THREE.MeshBasicMaterial({ color: col(0xffa21a) });
  function setIndicator(v: Traffic, dir: number, on: boolean) { v.ind[0].forEach(m => (m.visible = on && dir < 0)); v.ind[1].forEach(m => (m.visible = on && dir > 0)); }
  function addPool(kind: Kind, n: number, oncoming: boolean) {
    for (let i = 0; i < n; i++) {
      const base = kind === "truck" ? buildTruck() : kind === "auto" ? buildAuto() : kind === "bus" ? buildBus() : buildCar(kind as CarKind, 0xffffff, false);
      const v: Traffic = Object.assign(base, {
        kind, oncoming, dir: (oncoming ? -1 : 1) as 1 | -1, glowsFront: [] as THREE.Sprite[], glowsRear: [] as THREE.Sprite[],
        active: false, lane: 0, targetLane: 0, x: 0, z: 0, speed: 0, baseSpeed: 0, changeT: 0, gap: Infinity, awarded: false, inZone: false, lat: 0,
        ind: [[], []] as THREE.Mesh[][], signalT: 0, signalDir: 0, pendingLane: 0, brakeT: 0, honkCd: 0, prevSpeed: 0
      });
      for (const [si, s] of [-1, 1].entries()) for (const end of [-1, 1]) { // orange indicator boxes at the corners
        const m = new THREE.Mesh(indGeo, indMat); m.position.set(s * (v.hw - 0.14), v.ly + 0.14, end * (v.hl + 0.03)); m.visible = false; v.tilt.add(m); v.ind[si].push(m);
      }
      if (kind === "truck") v.sign = addHornSign(v);
      for (const s of [-1, 1]) { // night lights: white at the front, red at the back
        const f = glow(sharedHeadGlow, 2.2, s * v.lx, v.ly, -(v.hl + 0.25)); f.visible = false; v.tilt.add(f); v.glowsFront.push(f);
        const r = glow(sharedTailGlow, 1.8, s * v.lx, v.ly + 0.1, v.hl + 0.25); r.visible = false; v.tilt.add(r); v.glowsRear.push(r);
      }
      v.root.visible = false; scene.add(v.root); traffic.push(v);
    }
  }
  addPool("sedan", 6, false); addPool("suv", 4, false); addPool("truck", 3, false); addPool("auto", 3, false); addPool("bus", 2, false);
  addPool("sedan", 2, true); addPool("suv", 2, true); addPool("truck", 1, true); addPool("auto", 1, true); addPool("bus", 1, true); // oncoming (two-way roads only)

  /* ---------- look (time of day, weather, location) ---------- */
  let look = lookOf();
  function updateGlows(v: Traffic) {
    for (const s of v.glowsFront) s.visible = v.active && look.headlightsOn && v.dir < 0;
    for (const s of v.glowsRear) s.visible = v.active && (look.lampsOn || look.rain) && v.dir > 0;
  }
  function applyLook() {
    look = lookOf();
    const skyMat = sky.material as THREE.MeshBasicMaterial;
    skyMat.map = skyTexture(look, false); skyMat.needsUpdate = true;
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(col(look.fog)); fog.near = look.near; fog.far = look.far;
    hemi.color.copy(col(look.hemiSky)); hemi.groundColor.copy(col(look.hemiGround)); hemi.intensity = look.hemiInt;
    sun.color.copy(col(look.sunCol)); sun.intensity = look.sunInt;
    renderer.toneMappingExposure = look.exposure;
    scene.environment = envFor(look);
    scene.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) (m as THREE.MeshStandardMaterial).envMapIntensity = look.envInt;
    });
    // wet road: shiny puddle roughness map, darker asphalt, strong sky reflection
    roadMat.roughnessMap = look.rain ? assets.rough : null;
    roadMat.roughness = look.rain ? 1 : 0.92;
    roadMat.color.setScalar(look.rain ? 0.72 : 1);
    roadMat.reflectivity = look.rain ? 1 : 0.5; // wet asphalt mirrors much more of the sky and lights
    roadMat.envMapIntensity = look.rain ? 2.6 : 0.35;
    roadMat.needsUpdate = true;
    // lights: headlight beams, lamp light pools & halos, moon. Rain stretches the pools into reflections.
    headlights.visible = look.headlightsOn;
    moon.visible = look.moon; moonHalo.visible = look.moon;
    for (const s of segments) { updateSeg(s); s.pool.scale.set(1, 1, look.rain ? 1.9 : 1); }
    scen.setNight(look.night);
    poolMat.opacity = look.rain ? 0.9 : 0.55;
    rain.visible = look.rain || look.dust;
    rainMat.color.set(look.dust ? 0xd8b070 : 0xbcd0e8);
    rainMat.opacity = look.dust ? 0.5 : look.night ? 0.3 : 0.42;
    sharedHeadGlow.opacity = look.headlightsOn ? 0.9 : 0.25; // headlights only glow when they are on
    for (const v of traffic) updateGlows(v);
  }

  /* ---------- state ---------- */
  type State = "menu" | "setup" | "garage" | "playing" | "crashed" | "arrived" | "over";
  let state: State = "menu";
  let speed = 20, base = 27.8, dist = 0, bonus = 0, playTime = 0, fuel = 1, nitroOn = false;
  let pz = 0, px = LANES[1], pvx = 0, crashT = 0, spin = 0, spinAngle = 0, shake = 0, camX = px, fov = 60;
  let rpm = 2500, scrapeCd = 0, garageAngle = 0.5, mult = 1;
  let hits = 0, invuln = 0; // damage: the car survives two hits and is wrecked by the third
  // destination mode: the map, the junctions ahead and just behind, and a turn in progress
  let dest: Destination | null = null;
  let jz = -Infinity, jzPrev = -Infinity, kitCur = 0, terrainJunctions: number[] = [];
  interface Turning { dir: 1 | -1; phase: "arm" | "arc" | "out"; xe: number; ze: number; phi: number; out: number } // dir: +1 = left, -1 = right
  let turning: Turning | null = null, turnYaw = 0, turnCam = 0, arrivedT = 0, mapAcc = 0, arrivalBonus = 0;
  const TURN_R = 11, TURN_ZONE = 90; // turning radius, and how far before a junction a turn can be started
  const snd = new Sound();
  const inp: Record<Control, boolean> = { left: false, right: false, nitro: false, brake: false };
  const touchIn: Record<Control, boolean> = { left: false, right: false, nitro: false, brake: false };
  const keyIn: Record<Control, boolean> = { left: false, right: false, nitro: false, brake: false };
  const KEYMAP: Record<string, Control> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "nitro", KeyW: "nitro", Space: "nitro", ArrowDown: "brake", KeyS: "brake" };

  /* ---------- traffic logic ---------- */
  const groupOf = (oncoming: boolean) => (oncoming ? [4, 5] : [0, 1, 2, 3]);
  function occupied(group: number[], z: number, half: number, ignore?: Traffic) {
    const s = new Set<number>();
    for (const w of traffic) if (w.active && w !== ignore && Math.abs(w.z - z) < half + w.hl) {
      if (group.includes(w.lane)) s.add(w.lane);
      if (group.includes(w.targetLane)) s.add(w.targetLane);
    }
    return s;
  }
  function laneClear(lane: number, z: number, hl: number, ignore: Traffic | undefined, margin: number) {
    for (const w of traffic) if (w.active && w !== ignore && (w.lane === lane || w.targetLane === lane) && Math.abs(w.z - z) < hl + w.hl + margin) return false;
    return true;
  }
  function spawn(v: Traffic, z: number) {
    const group = groupOf(v.oncoming);
    for (let tries = 0; tries < 8; tries++) {
      const lane = pick(group);
      if (!laneClear(lane, z, v.hl, v, v.oncoming ? 30 : 16)) continue;
      const occ = occupied(group, z, 30, v);
      if (!occ.has(lane) && occ.size >= group.length - 1) continue; // always keep at least one lane free
      v.lane = v.targetLane = lane; v.x = laneX(lane); v.z = z;
      const [a, b] = (v.oncoming ? SPEEDS_ONC : SPEEDS_SAME)[v.kind]; v.baseSpeed = rnd(a, b); v.speed = v.baseSpeed;
      v.changeT = rnd(3, 9); v.gap = Infinity; v.awarded = false; v.inZone = false; v.lat = 0;
      v.signalT = 0; v.signalDir = 0; v.brakeT = 0; v.honkCd = rnd(1, 4); v.prevSpeed = v.baseSpeed; setIndicator(v, 0, false); v.tail.emissiveIntensity = 1.1;
      const india = settings.place === "india";
      if (v.kind === "auto") { const [a, b] = pick(AUTO_COLORS); v.paint.color.copy(col(a)); v.trailerPaint!.color.copy(col(b)); }
      else if (v.kind === "bus") { v.paint.color.copy(col(pick(BUS_COLORS))); v.trailerPaint!.color.copy(col(0xe9e9ec)); }
      else if (v.trailerPaint) { v.trailerPaint.color.copy(col(pick(india ? BRIGHT : TRAILER_COLORS))); v.paint.color.copy(col(pick(india ? BRIGHT : CAB_COLORS))); }
      else v.paint.color.copy(col(settings.place === "city" && Math.random() < 0.3 ? 0xf2c200 : pick(CAR_COLORS))); // taxis in the city
      if (v.sign) v.sign.visible = india; // "HORN OK PLEASE"
      v.active = true; v.root.visible = true; v.root.position.set(v.x, 0, v.z);
      v.root.rotation.y = v.oncoming ? Math.PI : 0; // oncoming cars face us
      updateGlows(v);
      return true;
    }
    return false;
  }
  function spawnOne(zAhead: number, oncoming: boolean) {
    const free = traffic.filter(v => !v.active && v.oncoming === oncoming);
    const mix = PLACES[settings.place].mix; // each location has its own vehicle mix
    const weights = free.map(v => mix[v.kind] ?? 0);
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) return false;
    if (destMode() && dest && (turning || (!dest.exits.straight && !dest.atDestination && pz - zAhead < jz - 6))) return false; // not into a turn, nor behind a dead-end wall
    let r = Math.random() * total, i = 0;
    while (i < free.length - 1 && (r -= weights[i]) > 0) i++;
    return spawn(free[i], pz - zAhead);
  }
  function updateTraffic(dt: number) {
    const poolSame = traffic.filter(v => !v.oncoming).length;
    const wantSame = Math.min(poolSame, 6 + Math.floor(playTime / 18)); // denser the longer you survive
    const wantOnc = layout.twoWay ? Math.min(5, 2 + Math.floor(playTime / 40)) : 0;
    let nSame = 0, nOnc = 0;
    for (const v of traffic) if (v.active) { if (v.oncoming) nOnc++; else nSame++; }
    if (state === "playing") {
      if (nSame < wantSame && Math.random() < dt * 2.5) spawnOne(rnd(250, 330), false);
      if (nOnc < wantOnc && Math.random() < dt * 1.2) spawnOne(rnd(280, 340), true);
      if (TESTHIT && Math.random() < dt * 0.5) {
        const v = traffic.find(t => !t.active && !t.oncoming && t.kind === "sedan");
        if (v && spawn(v, pz - 90)) { const l = LANES.reduce((b, x, i) => (Math.abs(x - px) < Math.abs(LANES[b] - px) ? i : b), 0); v.lane = v.targetLane = l; v.x = LANES[l]; v.baseSpeed = v.speed = 8; }
      }
    }

    for (const v of traffic) {
      if (!v.active) continue;
      // car following within the same direction of travel (traffic also keeps behind the player)
      let lead = v.baseSpeed;
      const check = (z: number, x: number, hl: number, hw: number, sp: number) => {
        const ahead = v.dir * (v.z - z); // > 0 when that vehicle is in front of us
        if (ahead <= 0 || Math.abs(x - v.x) > v.hw + hw + 0.3) return;
        const gap = ahead - v.hl - hl;
        if (gap < 22) lead = Math.min(lead, gap < 7 ? sp * 0.8 : sp);
      };
      for (const w of traffic) if (w.active && w !== v && w.dir === v.dir) check(w.z, w.x, w.hl, w.hw, w.speed);
      if (v.dir === 1 && state !== "menu") check(pz, px, player.hl, player.hw, speed);
      // now and then a car well ahead of the player brakes hard for a moment
      if (!v.oncoming && state === "playing" && v.brakeT <= 0 && v.z < pz - 70 && Math.random() < dt * 0.012) v.brakeT = rnd(1.2, 2);
      if (v.brakeT > 0) { v.brakeT -= dt; lead = Math.min(lead, v.baseSpeed * 0.3); }
      v.speed += clamp(lead - v.speed, (v.brakeT > 0 ? -16 : -8) * dt, 3 * dt);
      const decel = (v.prevSpeed - v.speed) / Math.max(dt, 1e-3); v.prevSpeed = v.speed;
      v.tail.emissiveIntensity += ((decel > 1.2 ? 3.4 : 1.1) - v.tail.emissiveIntensity) * Math.min(1, dt * 12); // brake lights
      v.z -= v.dir * v.speed * dt;

      // lane changes (smooth, only into a free lane, never when the player is close)
      if (!v.oncoming) {
        v.changeT -= dt;
        if (v.changeT <= 0 && v.lane === v.targetLane && v.signalT <= 0) {
          v.changeT = rnd(4, 10);
          if (Math.abs(v.z - pz) > 30 && Math.random() < 0.7) {
            const cand = v.lane + (Math.random() < 0.5 ? -1 : 1);
            if (cand >= 0 && cand <= 3 && laneClear(cand, v.z, v.hl, v, 14)) {
              const occ = occupied([0, 1, 2, 3], v.z, 24, v); occ.delete(v.lane);
              if (occ.has(cand) || occ.size < 3) { v.pendingLane = cand; v.signalDir = cand - v.lane; v.signalT = 1.3; } // indicate first
            }
          }
        }
        if (v.signalT > 0) {
          v.signalT -= dt;
          setIndicator(v, v.signalDir, Math.floor(performance.now() / 160) % 2 === 0);
          if (v.signalT <= 0) {
            setIndicator(v, 0, false);
            if (laneClear(v.pendingLane, v.z, v.hl, v, 12)) v.targetLane = v.pendingLane;
            v.signalDir = 0;
          }
        }
        if (v.lane !== v.targetLane) {
          const dx = laneX(v.targetLane) - v.x, sp = Math.min(2.4, Math.abs(dx) * 2.2 + 0.35);
          const step = clamp(dx, -sp * dt, sp * dt); v.x += step; v.lat = step / dt;
          if (Math.abs(laneX(v.targetLane) - v.x) < 0.02) { v.x = laneX(v.targetLane); v.lane = v.targetLane; v.lat = 0; }
        }
        v.root.rotation.y = lerp(v.root.rotation.y, -v.lat / Math.max(8, v.speed) * 1.2, Math.min(1, dt * 6));
      }
      v.root.position.set(v.x, 0, v.z);
      const farAway = Math.abs(v.z - pz) > 110; // distant vehicles skip their wheels (too small to see) to save draw calls
      for (const w of v.wheels) { w.g.rotation.x -= v.speed / w.r * dt; w.g.visible = !farAway; }

      if (v.z > pz + 40 || (destMode() && dest && !dest.exits.straight && !dest.atDestination && v.dir === 1 && v.z < jz - 9)) { v.active = false; v.root.visible = false; updateGlows(v); continue; }

      if (state === "playing" && !v.oncoming) { // honk at a car that is right behind, and now and then just because
        v.honkCd -= dt;
        const gapBehind = pz - v.z - v.hl - player.hl;
        const tailgated = gapBehind > 0 && gapBehind < 22 && Math.abs(v.x - px) < 2.3 && speed > v.speed + 3;
        if (v.honkCd <= 0 && (tailgated || (Math.abs(v.z - pz) < 90 && Math.random() < dt * 0.025 * PLACES[settings.place].honk))) {
          v.honkCd = rnd(3, 6);
          snd.honk(clamp(1 - Math.hypot(v.x - px, v.z - pz) / 140, 0.12, 1), HONK_PITCH[v.kind]);
        }
      }
      if (state === "playing") {
        const dz = Math.abs(v.z - pz), reach = player.hl + v.hl, dx = Math.abs(v.x - px), lat = player.hw + v.hw;
        if (dz < reach + 2.5) {
          v.inZone = true; v.gap = Math.min(v.gap, dx - lat);
          if (dx < lat - 0.08 && dz < reach - 0.1 && !INVINCIBLE && invuln <= 0 && !turning) { hitCar(v); if (state !== "playing") return; }
        } else if (v.inZone && v.z > pz) { // just passed it without touching
          if (!v.awarded && v.gap >= 0 && v.gap < 0.85) { v.awarded = true; bonus += 50; toast(); }
          v.inZone = false;
        }
      }
    }
  }

  /* ---------- world layout & game flow ---------- */
  function layoutWorld() {
    segments.forEach((s, i) => { s.z = pz + 40 - i * SEG_LEN; s.g.position.z = s.z; updateSeg(s); });
    bridges.forEach((b, i) => { b.z = pz - 260 - i * 520; b.g.position.z = b.z; });
    trees.forEach((t, i) => placeTree(t, pz + 30 - (i / trees.length) * 480 - rnd(0, 8)));
    hills.forEach((h, i) => h.m.position.set(h.side * rnd(190, 340), h.m.position.y, pz - i * 60 + 100));
  }
  function toast() {
    const t = q("#toast"); t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  }
  function resetGame() {
    pz = -SKIP; px = LANES[1]; pvx = 0; speed = 27.8; dist = 0; bonus = 0; playTime = 0; fuel = 1; spin = 0; spinAngle = 0; crashT = 0;
    shake = 0; camX = px; rpm = 2500;
    player.root.rotation.set(0, 0, 0); player.tilt.rotation.set(0, 0, 0);
    for (const v of traffic) { v.active = false; v.root.visible = false; updateGlows(v); }
    smoke.clear(); sparks.clear(); skid.clear(); soot.clear(); glass.clear();
    hits = 0; invuln = 0; players.forEach(p => { repairCar(p); p.root.visible = p === player; }); updateDmg();
    turning = null; turnYaw = 0; turnCam = 0; arrivedT = 0; arrivalBonus = 0; kitCur = 0; jzPrev = -Infinity; jz = -Infinity;
    q("#banner").classList.remove("show"); fadeEl.style.opacity = "0";
    if (destMode()) { dest ??= new Destination(); dest.reset(); jz = -dest.len; if (SKIPJ) pz = jz + SKIPJ; }
    applyPlace(false);
    layoutWorld();
    kits.forEach(k => k.hide());
    if (destMode() && dest) kits[0].place(dest.junctionInfo(jz));
    for (let i = 0; i < 6; i++) spawnOne(55 + i * 45 + rnd(0, 25), false);
    if (layout.twoWay) for (let i = 0; i < 3; i++) spawnOne(90 + i * 80 + rnd(0, 30), true);
  }
  function startGame() {
    audioUnlocked = true;
    snd.init(); snd.setRain(look.rain);
    resetGame();
    state = "playing"; root.classList.add("playing");
    q("#start").classList.add("hidden");
  }
  const dmgEl = q("#dmg"), flashEl = q("#flash"), fadeEl = q("#fade"), bannerEl = q("#banner"), navEl = q("#navHint");
  const mapEl = q<HTMLCanvasElement>("#minimap");
  const tmpV2 = new THREE.Vector3();
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  /* ---------- destination mode: crossroads, turning, arriving ---------- */
  /** Called every frame in destination mode: junction visibility, starting a turn, driving through, dead ends. */
  function destStep() {
    const d = dest!, ex = d.exits, dNext = pz - jz;
    kits[kitCur].group.visible = dNext < 540;
    kits[1 - kitCur].group.visible = isFinite(jzPrev) && pz - jzPrev > -75;
    if (state !== "playing") return;
    // a turn starts when the car is in the outer lane, steering towards a road that exists, within sight of the junction
    if (!turning && dNext < TURN_ZONE && dNext > 5.4 + TURN_R + 1) {
      const dir = inp.left && px < -3 && ex.left ? 1 : inp.right && px > 3 && ex.right ? -1 : 0;
      if (dir) turning = { dir, phase: "arm", xe: dir > 0 ? LANES[0] : LANES[3], ze: 0, phi: 0, out: 0 };
    }
    if (turning?.phase === "arm" && pz <= jz + 5.4 + TURN_R) { turning.phase = "arc"; turning.xe = px; turning.ze = pz; turning.phi = 0; } // begin the corner
    if (turning) return;
    if (!ex.straight && !d.atDestination && pz - player.hl < jz - 9.6) { crash({ x: px } as Traffic); return; } // the road ends in a wall
    if (pz < jz - 0.5) { // drove through the middle of the junction
      if (d.atDestination) arrive();
      else if (ex.straight) {
        jzPrev = jz; d.goStraight(jz); jz = jz - d.len;
        kitCur = 1 - kitCur; kits[kitCur].place(d.junctionInfo(jz));
        terrain.junctions = [-jzPrev, -jz]; // the next junction is straight and flat too
        if (SKIPJ) pz = jz + SKIPJ; // (test flag) jump to just before the next junction
      }
    }
  }
  /** The car swings round the corner on a quarter circle; the world stays put and the camera follows behind. */
  function stepTurn(dt: number) {
    const T = turning!;
    speed = Math.max(12, speed - 10 * dt);
    if (T.phase === "arc") {
      T.phi += (speed * dt) / TURN_R;
      const phi = Math.min(T.phi, Math.PI / 2), cx = T.xe - T.dir * TURN_R;
      px = cx + T.dir * TURN_R * Math.cos(phi); pz = T.ze - TURN_R * Math.sin(phi);
      turnYaw = T.dir * phi; pvx = 0;
      if (T.phi >= Math.PI / 2) { T.phase = "out"; T.out = 0; fadeEl.classList.remove("slow"); fadeEl.style.opacity = "1"; }
    } else { // out: a moment along the new road while the screen fades
      px -= T.dir * speed * dt; T.out += dt;
      if (T.out > 0.22) finishTurn();
    }
  }
  /** The corner is done: the new road becomes the straight road ahead, with fresh scenery, while the screen is dark. */
  function finishTurn() {
    const T = turning!, d = dest!, past = Math.abs(px);
    d.turn(T.dir > 0 ? "left" : "right");
    turning = null; turnYaw = 0; turnCam = 0; spinAngle = 0;
    px = T.dir > 0 ? LANES[0] : LANES[3]; pz = past; pvx = 0; camX = px;
    jzPrev = -Infinity; jz = -d.len; kitCur = 0; kits[1].hide(); kits[0].place(d.junctionInfo(jz));
    for (const v of traffic) { v.active = false; v.root.visible = false; updateGlows(v); }
    smoke.clear(); sparks.clear(); skid.clear();
    if (SKIPJ) pz = jz + SKIPJ; // (test flag) jump to just before the next junction
    applyPlace(false); layoutWorld();
    fadeEl.classList.add("slow"); fadeEl.style.opacity = "0";
  }
  function arrive() {
    const d = dest!;
    state = "arrived"; arrivedT = 0;
    arrivalBonus = Math.max(500, Math.round(9000 - playTime * 25)); bonus += arrivalBonus; // the faster, the bigger
    bannerEl.querySelector(".t")!.textContent = "DESTINATION REACHED";
    bannerEl.querySelector(".s")!.textContent = `${d.destName} · ${mmss(playTime)} · +${arrivalBonus.toLocaleString()}`;
    bannerEl.classList.add("show");
    snd.honk(1, 520);
  }
  function updateNav(dt: number) {
    mapAcc += dt; if (mapAcc < 0.1) return; mapAcc = 0;
    const d = dest!; d.draw(mapEl, pz);
    if (turning) { navEl.innerHTML = "<small>Turning</small><b>&nbsp;</b>"; return; }
    const rec = d.recommended(), m = Math.max(0, Math.round((pz - jz) / 10) * 10);
    const what = d.atDestination ? "<b>Destination ahead</b>" : rec === "left" ? "&#9664; <b>Turn left</b>" : rec === "right" ? "<b>Turn right</b> &#9654;" : "&#9650; <b>Straight on</b>";
    navEl.innerHTML = `<small>${d.name(d.to)} &middot; ${m} m</small>${what}`;
  }

  function updateDmg() {
    dmgEl.querySelectorAll("i").forEach((p, i) => p.classList.toggle("lost", i >= 3 - hits));
    dmgEl.classList.toggle("warn", hits === 2);
  }
  function flash() { flashEl.classList.remove("hit"); void flashEl.offsetWidth; flashEl.classList.add("hit"); }
  /** The player touched a vehicle. Two hits are survivable (dents, cracked glass, lost speed); the third wrecks the car. */
  function hitCar(v: Traffic) {
    hits = Math.min(3, hits + (v.oncoming ? 2 : 1)); // a head-on smash counts double
    v.awarded = true;
    updateDmg(); flash();
    if (hits >= 3) { crash(v); return; }
    const side = px >= v.x ? 1 : -1;
    speed *= 0.55; pvx += side * 5; shake = Math.max(shake, 0.9); invuln = 1.8;
    snd.hit();
    const lx = clamp(v.x - px, -player.hw, player.hw), lz = clamp(v.z - pz, -player.hl, player.hl);
    dentCar(player, lx, 0.65, lz, 1.7, 0.3); setCracks(player, hits);
    for (let i = 0; i < 18; i++) sparks.emit(px + lx, rnd(0.3, 1), pz + lz, rnd(-5, 5), rnd(1, 5), rnd(-6, 4), rnd(0.35, 0.8), 0.4, 0.08, 1);
    for (let i = 0; i < 16; i++) glass.emit(px + rnd(-0.6, 0.6), rnd(1.1, 1.5), pz + rnd(-1, 0.5), rnd(-3, 3), rnd(1, 4), rnd(-4, 3), rnd(0.8, 1.4), 0.16, 0.08, 0.9);
  }
  function crash(hit: Traffic) {
    state = "crashed"; crashT = 0;
    spin = (Math.random() < 0.5 ? -1 : 1) * rnd(5, 8);
    pvx += (px >= hit.x ? 1 : -1) * 4; shake = 1;
    snd.crash(); snd.engine(rpm, false, 0, false);
    for (let i = 0; i < 26; i++) sparks.emit(px + rnd(-0.8, 0.8), rnd(0.3, 1.1), pz - player.hl + rnd(-0.5, 0.5), rnd(-6, 6), rnd(1, 6), rnd(-8, 6), rnd(0.4, 0.9), 0.3, 0.06, 1);
  }
  function gameOver(info?: GameOverInfo) {
    state = "over";
    root.classList.remove("playing");
    snd.setRain(false);
    onGameOver(Math.floor(dist + bonus), info); // the hub shows the Game over panel
  }

  /* ---------- start screen, setup, garage ---------- */
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
  function syncUi() {
    root.querySelectorAll<HTMLElement>(".seg").forEach(seg => {
      const opt = seg.dataset.opt as "mode" | "time" | "weather" | "place" | "twoWay";
      const now = opt === "twoWay" ? (settings.twoWay ? "1" : "0") : settings[opt];
      seg.querySelectorAll<HTMLElement>("button").forEach(b => b.classList.toggle("on", b.dataset.v === now));
    });
    root.querySelectorAll<HTMLElement>(".gcar").forEach(b => b.classList.toggle("on", Number(b.dataset.car) === settings.car));
    q("#carName").textContent = CARS[settings.car].name;
    syncMode();
    q("#summary").innerHTML = [cap(settings.time), settings.weather === "clear" ? "Clear" : settings.weather === "dust" ? "Dust storm" : cap(settings.weather), PLACES[settings.place].name, destMode() ? "Destination" : settings.twoWay ? "Two-way" : "One-way"]
      .map(t => `<b>${t}</b>`).join(" &middot; ");
  }
  /** Destination mode shows the map on the start card; the map is made once per game. */
  function syncMode() {
    root.classList.toggle("dest", destMode());
    if (!destMode()) return;
    dest ??= new Destination();
    dest.draw(q<HTMLCanvasElement>("#mapPreview"), 0, false);
    q("#destLine").innerHTML = `Drive from <b>${dest.startName}</b> to <b>${dest.destName}</b>`;
  }
  function selectCar(i: number) {
    if (players[i] !== player) {
      players[i].root.position.copy(player.root.position);
      player.root.visible = false;
      player = players[i]; player.root.visible = true;
      mountHeadlights();
    }
    cur = CARS[i]; settings.car = i;
    syncUi();
  }
  function setState(s: State) {
    state = s;
    root.classList.toggle("garage", s === "garage");
    root.classList.toggle("setup", s === "setup");
    q("#start").classList.toggle("hidden", s !== "menu");
  }
  /** Called when the location changes (and at the start of every run): new road shape for that place. */
  function applyPlace(rebuildWorld: boolean) {
    const P = PLACES[settings.place];
    terrainJunctions = destMode() && isFinite(jz) ? [-jz] : [];
    terrain = makeTerrain(P.curve, P.hill, terrainJunctions);
    if (rebuildWorld) { buildRoad(twoWayNow()); buildPlaceVisuals(); layoutWorld(); applyLook(); }
  }
  root.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    const segBtn = t.closest<HTMLElement>(".seg button");
    if (segBtn && state === "setup") {
      const opt = (segBtn.parentElement as HTMLElement).dataset.opt as "mode" | "time" | "weather" | "place" | "twoWay";
      const v = segBtn.dataset.v as string;
      if (opt === "mode") settings.mode = v === "destination" ? "destination" : "free";
      else if (opt === "twoWay") settings.twoWay = v === "1";
      else if (opt === "time") settings.time = v as TimeOfDay;
      else if (opt === "weather") settings.weather = v as Weather;
      else settings.place = v as PlaceId;
      saveSettings();
      if (opt === "twoWay" || opt === "mode") { jz = jzPrev = -Infinity; kits.forEach(k => k.hide()); buildRoad(twoWayNow()); buildPlaceVisuals(); layoutWorld(); }
      if (opt === "place") applyPlace(true);
      applyLook(); syncUi(); return;
    }
    const carBtn = t.closest<HTMLElement>(".gcar");
    if (carBtn && state === "garage") { selectCar(Number(carBtn.dataset.car)); saveSettings(); return; }
    if (t.closest("#garageBtn") && state === "menu") { garageAngle = 0.5; setState("garage"); return; }
    if (t.closest("#setupBtn") && state === "menu") { setState("setup"); return; }
    if ((t.closest("#garageDone") && state === "garage") || (t.closest("#setupDone") && state === "setup")) { setState("menu"); return; }
  });

  /* ---------- input ---------- */
  const onKeyDown = (e: KeyboardEvent) => {
    const k = KEYMAP[e.code];
    if (k) { keyIn[k] = true; if (state === "playing") e.preventDefault(); }
    else if (e.code === "Enter" && state === "menu") { e.preventDefault(); startGame(); }
    else if (e.code === "Escape" && (state === "garage" || state === "setup")) setState("menu");
  };
  const onKeyUp = (e: KeyboardEvent) => { const k = KEYMAP[e.code]; if (k) keyIn[k] = false; };
  const onBlur = () => { (Object.keys(keyIn) as Control[]).forEach(k => (keyIn[k] = false)); };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  function bindBtn(el: HTMLElement, key: Control) {
    const ids = new Set<number>();
    const sync = () => { touchIn[key] = ids.size > 0; el.classList.toggle("on", ids.size > 0); };
    el.addEventListener("pointerdown", e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } ids.add(e.pointerId); sync(); });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, e => { ids.delete((e as PointerEvent).pointerId); sync(); });
    el.addEventListener("contextmenu", e => e.preventDefault());
  }
  bindBtn(q("#bLeft"), "left"); bindBtn(q("#bRight"), "right"); bindBtn(q("#bBrake"), "brake"); bindBtn(q("#bNitro"), "nitro");
  q("#startBtn").addEventListener("click", startGame);
  const syncMuteIcon = () => {
    q("#icoOn").style.display = snd.muted ? "none" : ""; q("#icoOff").style.display = snd.muted ? "" : "none";
    q("#mute").setAttribute("aria-label", snd.muted ? "Unmute sound" : "Mute sound");
  };
  q("#mute").addEventListener("click", () => { snd.setMuted(!snd.muted); syncMuteIcon(); });
  syncMuteIcon();
  const onVisibility = () => { if (document.hidden) snd.suspend(); else if (state === "playing" || state === "crashed") snd.resume(); };
  document.addEventListener("visibilitychange", onVisibility);

  const ro = new ResizeObserver(() => {
    const { w, h } = size();
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(drawSize); fx.setSize(drawSize.x, drawSize.y);
  });
  ro.observe(container);

  /* ---------- per-frame update ---------- */
  const hudCache = { score: -1, kmh: -1, gear: -1 };
  const camLook = new THREE.Vector3();
  const el = { scoreVal: q("#scoreVal"), kmh: q("#kmh"), gear: q("#gear"), rpmFill: q("#rpmFill"), nitroFill: q("#nitroFill"), chip: q("#chip") };

  function update(dt: number) {
    inp.left = keyIn.left || touchIn.left; inp.right = keyIn.right || touchIn.right;
    inp.nitro = keyIn.nitro || touchIn.nitro; inp.brake = keyIn.brake || touchIn.brake;
    const playing = state === "playing", crashed = state === "crashed", wet = look.rain;
    scrapeCd -= dt;
    // the bend assumes the camera looks straight down the road, so it is switched off for a turn (near a junction the road is straight anyway)
    bend.uniforms.uBendAmt.value += ((state === "garage" || turning ? 0 : 1) - bend.uniforms.uBendAmt.value) * Math.min(1, dt * (turning ? 14 : 3));
    bend.update(-pz, terrain); // road curves and hills ahead
    if (AUTOPILOT && state === "playing" && dest && !turning) { // test helper: follows the fastest route by itself
      const dN = pz - jz, rec = dest.recommended();
      const lane = dN < 160 && rec ? (rec === "left" ? LANES[0] : rec === "right" ? LANES[3] : LANES[1]) : LANES[1], err = lane - px;
      inp.left = err < -0.6; inp.right = err > 0.6; inp.nitro = true; inp.brake = false;
      if (dN < TURN_ZONE - 5 && dN > 22 && rec === "left") { inp.left = true; inp.right = false; }
      if (dN < TURN_ZONE - 5 && dN > 22 && rec === "right") { inp.right = true; inp.left = false; }
    }
    if (destMode() && dest && (state === "playing" || state === "arrived")) destStep();

    if (playing) {
      playTime += dt;
      base = Math.min(50, 27.8 + 22.2 * Math.min(1, playTime / 200)) * cur.speedMul * (1 - 0.07 * hits); // ~100 km/h rising to ~180 km/h; damage costs top speed
      nitroOn = inp.nitro && !inp.brake && fuel > 0.01 && !turning;
      fuel = nitroOn ? Math.max(0, fuel - cur.drain * dt) : Math.min(1, fuel + 0.07 * dt);
      const target = base * (nitroOn ? 1.4 : 1);
      if (inp.brake) speed = Math.max(base * 0.5, speed - cur.brake * (wet ? 0.8 : 1) * dt);
      else { const a = speed < target ? (nitroOn ? 18 : 9) : 12; speed += clamp(target - speed, -a * dt, a * dt); }
      const steer = turning?.phase === "arm" ? clamp((turning.xe - px) * 0.7, -1, 1) : (inp.right ? 1 : 0) - (inp.left ? 1 : 0); // a committed turn lines the car up by itself
      if (turning?.phase === "arm") speed = Math.max(17, speed - 20 * dt); // and slows for the corner
      // steering has momentum; wet roads give less grip (more slide)
      pvx += (steer * cur.steer * (wet ? 0.88 : 1) - pvx * (wet ? 4.5 : 5.5)) * dt; pvx = clamp(pvx, -9, 9);
      pvx += -bend.curvature * speed * speed * 0.8 * dt; // bends push the car towards the outside
      mult = layout.twoWay && px < -7.2 ? 2 : 1; // driving against the traffic pays double
      dist += speed * dt * mult;
    } else if (crashed) {
      nitroOn = false; mult = 1;
      speed = Math.max(0, speed - 26 * dt); pvx *= 1 - Math.min(1, 1.6 * dt);
      spinAngle += spin * dt; spin *= 1 - Math.min(1, 1.1 * dt);
      crashT += dt; if (crashT > 1.0) gameOver();
    } else if (state === "arrived") {
      nitroOn = false; mult = 1; speed = Math.max(0, speed - 12 * dt); pvx *= 1 - Math.min(1, 3 * dt);
      arrivedT += dt;
      if (arrivedT < 2.6) for (let i = 0; i < 2; i++) sparks.emit(px + rnd(-9, 9), rnd(2, 7), pz + rnd(-12, -2), rnd(-3, 3), rnd(4, 10), rnd(-6, 2), rnd(0.8, 1.6), 0.4, 0.1, 1); // fireworks
      if (arrivedT > 3.2) gameOver({ title: "Destination reached!", note: `${dest!.destName} in ${mmss(playTime)}` });
    } else { // menu / garage / after the run
      nitroOn = false; mult = 1; pvx *= 1 - Math.min(1, 4 * dt);
      if (state === "garage") speed = Math.max(0, speed - 30 * dt);
      else if (state === "menu") speed += clamp(20 - speed, -20 * dt, 8 * dt);
      else speed = Math.max(8, speed - 6 * dt);
    }

    if (turning && turning.phase !== "arm") stepTurn(dt); else { px += pvx * dt; pz -= speed * dt; }
    if (destMode() && dest && !dest.exits.straight && !dest.atDestination && pz < jz - 7.2) { pz = jz - 7.2; speed = Math.min(speed, 2); } // the dead-end wall is solid
    if (!(turning && turning.phase !== "arm") && (px > X_MAX || px < layout.xMin)) { // guardrail: bounce, slow down, shake
      const s = px > X_MAX ? 1 : -1; px = s > 0 ? X_MAX : layout.xMin;
      if (pvx * s > 0) pvx = -pvx * 0.3;
      if (playing) {
        speed = Math.max(base * 0.35, speed - 16 * dt); shake = Math.max(shake, 0.22);
        for (let i = 0; i < 5; i++) sparks.emit(px + s * 0.85, rnd(0.25, 0.8), pz + rnd(-1.8, 1.8), -s * rnd(0.5, 3), rnd(1, 4), rnd(0, 6) - speed * 0.25, rnd(0.35, 0.8), 0.5, 0.1, 1);
        if (scrapeCd <= 0) { snd.scrape(); scrapeCd = 0.2; }
      }
    }

    updateTraffic(dt);

    const braking = playing && inp.brake;
    player.tilt.rotation.z = lerp(player.tilt.rotation.z, pvx * 0.014, Math.min(1, dt * 8)); // lean when steering
    player.tilt.rotation.x = lerp(player.tilt.rotation.x, braking ? -0.045 : nitroOn ? 0.03 : 0, Math.min(1, dt * 7)); // nose dips when braking
    player.root.rotation.y = -pvx * 0.03 + spinAngle + turnYaw;
    player.root.position.set(px, 0, pz);
    for (const w of player.wheels) w.g.rotation.x -= speed / w.r * dt;
    player.tail.emissiveIntensity = braking ? 3.2 : 1.1;
    if (player.wiper) { // rear wiper sweeps while it rains
      player.wiper.visible = look.rain;
      if (look.rain) player.wiper.rotation.z = Math.sin(performance.now() * 0.006) * 1.05;
    }
    if (player.flames) { // nitro flames flicker out of the exhausts
      player.flames.visible = nitroOn;
      if (nitroOn) player.flames.children.forEach(f => f.scale.set(1, 1, 0.7 + Math.random() * 0.8));
    }
    // tyre smoke and skid marks while braking hard or sliding; spray in the rain
    player.root.updateMatrixWorld();
    const skidding = (playing && ((inp.brake && speed > 24) || (Math.abs(pvx) > 5 && speed > 28))) || (turning?.phase === "arc" && speed > 14);
    const spraying = playing && look.rain && speed > 18;
    smokeAcc += dt * ((skidding ? 55 : 0) + (spraying ? 14 : 0));
    while (smokeAcc >= 1) {
      smokeAcc -= 1;
      tmpV.set((Math.random() < 0.5 ? -1 : 1) * (player.hw - 0.2), 0.2, player.hl - 0.4); player.root.localToWorld(tmpV);
      smoke.emit(tmpV.x, tmpV.y, tmpV.z, rnd(-0.8, 0.8), rnd(0.6, 1.6), rnd(-2, 2), rnd(0.8, 1.4), skidding ? 0.7 : 0.5, skidding ? 2.6 : 1.8, skidding ? 0.38 : 0.16);
    }
    if (skidding) {
      skidDist += speed * dt;
      if (skidDist > 1.2) {
        skidDist = 0;
        for (const sd of [-1, 1]) { tmpV.set(sd * (player.hw - 0.2), 0, player.hl - 0.55); player.root.localToWorld(tmpV); skid.add(tmpV.x, tmpV.z, player.root.rotation.y); }
      }
    }
    if (playing && hits >= 2) { // engine smoke once the car is badly damaged
      tmpV.set(rnd(-0.5, 0.5), 1.0, -(player.hl - 1.1)); player.root.localToWorld(tmpV);
      if (Math.random() < dt * 22) soot.emit(tmpV.x, tmpV.y, tmpV.z, rnd(-0.4, 0.4), rnd(1.2, 2.2), rnd(-1, 1), rnd(1, 1.6), 0.5, 1.8, 0.5);
    }
    invuln = Math.max(0, invuln - dt);
    player.root.visible = state === "garage" || invuln <= 0 || Math.floor(invuln * 12) % 2 === 0; // blinks while protected after a hit
    smoke.update(dt); sparks.update(dt); soot.update(dt); glass.update(dt);
    player.tailGlows?.forEach(g => (g.material.opacity = braking ? 1 : 0.6));

    // recycle road pieces, lamps, trees and hills so the world feels endless
    for (const s of segments) { if (s.z > pz + 60) { s.z -= SEG_COUNT * SEG_LEN; updateSeg(s); } else if (destMode()) updateSeg(s); s.g.position.z = s.z; }
    for (const b of bridges) { if (b.z > pz + 40) b.z -= 1040; b.g.position.z = b.z; setCasting(b.g, Math.abs(b.z - pz) < 75); }
    for (const sg of segments) setCasting(sg.g, Math.abs(sg.z - pz) < 75);
    const here = segments.find(s => Math.abs(s.z - pz) < 20);
    headlights.visible = look.headlightsOn || !!here?.tunnelOn; // beams come on inside tunnels
    for (const t of trees) { if (t.position.z > pz + 25) placeTree(t, pz - rnd(455, 490)); setCasting(t, Math.abs(t.position.z - pz) < 62 && Math.abs(t.position.x - px) < 48); }
    for (const h of hills) if (h.m.position.z > pz + 140) { h.m.position.z -= 720; h.m.position.x = h.side * rnd(190, 340); }
    grass.position.z = Math.round(pz / 4) * 4;

    sun.position.set(px + look.sunPos[0], look.sunPos[1], pz + look.sunPos[2]); sun.target.position.set(px, 0, pz - 10); sun.target.updateMatrixWorld();

    if (state === "garage") { // turntable view of the chosen car
      garageAngle += dt * 0.45;
      const R = player.kind === "suv" ? 8.6 : 7.4;
      fov += (42 - fov) * Math.min(1, dt * 4);
      if (Math.abs(camera.fov - fov) > 0.03) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.set(px + Math.sin(garageAngle) * R, 2.1, pz + Math.cos(garageAngle) * R);
      camLook.set(px, container.clientHeight < 470 ? -1.1 : 0.1, pz); camera.lookAt(camLook); // aim low so the car sits above the garage panel
      camX = px;
    } else {
      // chase camera: follows sideways smoothly, FOV widens with speed, vibration at speed, shake on impact
      camX += (px - camX) * Math.min(1, dt * 4);
      const k = clamp((speed - 22) / 45, 0, 1), fovT = 58 + 28 * k * k * (3 - 2 * k) + (nitroOn ? 3 : 0);
      fov += (fovT - fov) * Math.min(1, dt * 3);
      if (Math.abs(camera.fov - fov) > 0.03) { camera.fov = fov; camera.updateProjectionMatrix(); }
      shake *= Math.exp(-3.2 * dt); if (shake < 0.002) shake = 0;
      let ox = 0, oy = 0;
      if (!reduceMotion) {
        const vib = Math.max(0, (speed - 38) / 30) * 0.014 + shake * 0.55;
        ox = (Math.random() - 0.5) * vib; oy = (Math.random() - 0.5) * vib;
      }
      turnCam += ((turning && turning.phase !== "arm" ? 1 : 0) - turnCam) * Math.min(1, dt * 10);
      camera.position.set(camX * 0.92 + ox, 3.5 + oy, pz + 8.6);
      camLook.set(lerp(camX, px, 0.5), 0.5, pz - 9);
      if (turnCam > 0.001) { // behind the car as it swings round a corner
        const sy = Math.sin(turnYaw), cy = Math.cos(turnYaw);
        camera.position.lerp(tmpV2.set(px + sy * 8.6, 3.5 + oy, pz + cy * 8.6), turnCam);
        camLook.lerp(tmpV2.set(px - sy * 9, 0.5, pz - cy * 9), turnCam);
      }
      camera.lookAt(camLook);
      if (!reduceMotion && turnCam < 0.5) camera.rotateZ(-(px - camX) * 0.02); // bank slightly into the turn
    }
    sky.position.copy(camera.position);
    if (look.rain || look.dust) updateRain(dt, speed);

    // gears & engine: RPM climbs through each gear and drops on an upshift
    const kmh = speed * 3.6;
    let gi = 0; while (gi < GEAR_MAX.length - 1 && kmh > GEAR_MAX[gi]) gi++;
    const lo = gi ? GEAR_MAX[gi - 1] : 0, frac = clamp((kmh - lo) / (GEAR_MAX[gi] - lo), 0, 1);
    rpm += (2300 + frac * 5000 + (playing && !inp.brake ? 250 : 0) - rpm) * Math.min(1, dt * 9);
    snd.engine(rpm, nitroOn, playing ? 1 : 0.3, playing);
    // motion blur grows with speed and nitro (speed lines on devices that cannot do the blur)
    const blurT = !reduceMotion && (playing || crashed) && state !== "garage" ? clamp((speed - 36) / 26, 0, 1) * 0.07 + (nitroOn ? 0.03 : 0) : 0;
    blurS += (blurT - blurS) * Math.min(1, dt * 5);
    if (!fx.supported) speedfxEl.style.opacity = String(Math.min(0.55, blurS * 5));

    if (destMode() && dest && (playing || state === "arrived")) updateNav(dt);
    if (root.classList.contains("playing")) {
      const sc = Math.floor(dist + bonus); if (sc !== hudCache.score) { hudCache.score = sc; el.scoreVal.textContent = sc.toLocaleString(); }
      const kk = Math.round(kmh); if (kk !== hudCache.kmh) { hudCache.kmh = kk; el.kmh.textContent = String(kk); }
      if (gi !== hudCache.gear) { hudCache.gear = gi; el.gear.textContent = "GEAR " + (gi + 1); }
      el.rpmFill.style.width = clamp((rpm - 2000) / 6000, 0, 1) * 100 + "%";
      el.nitroFill.style.width = (fuel * 100).toFixed(1) + "%"; el.nitroFill.classList.toggle("low", fuel < 0.2);
      el.chip.classList.toggle("on", mult > 1);
    }
  }

  /* ---------- boot ---------- */
  buildRoad(twoWayNow());
  buildPlaceVisuals();
  bend.patchAll(scene);
  syncUi();
  applyLook();
  resetGame();
  for (const v of traffic) { v.active = false; v.root.visible = false; updateGlows(v); } // empty road behind the start screen

  let last: number | null = null, raf = 0, destroyed = false;
  function frame(now: number) {
    if (destroyed) return;
    const dt = last === null ? 0 : clamp((now - last) / 1000, 0, 0.05); // capped so lag never makes the game jump
    last = now;
    update(dt);
    if (INVINCIBLE) renderer.info.reset(); // count a whole frame (the blur pass renders twice)
    fx.render(scene, camera, blurS);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  if (INVINCIBLE) (window as unknown as { __hr3dDebug?: unknown }).__hr3dDebug = { scene, camera, kits, get segments() { return segments; }, get state() { return { px, pz, jz, turnYaw, turnCam }; } };
  if (INVINCIBLE) (window as unknown as { __hr3dInfo?: () => unknown }).__hr3dInfo = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, state, pz, jz, turning: turning?.phase ?? null, node: dest ? dest.name(dest.to) : null, atDest: dest?.atDestination ?? null, rec: dest?.recommended() ?? null, len: dest?.len ?? null });
  if (audioUnlocked) startGame(); // "Play again": no need to press Start twice

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      snd.close();
      disposeTree(scene);
      kit.dispose();
      kits.forEach(k => k.dispose());
      soot.dispose(); glass.dispose();
      smoke.dispose(); sparks.dispose(); skid.dispose(); fx.dispose();
      scen.dispose();
      textures.forEach(t => t.dispose());
      envCache.forEach(t => t.dispose());
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      root.remove();
      style.remove();
    }
  };
}
