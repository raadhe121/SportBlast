import * as THREE from "three";

// Road curves and hills.
//
// The game logic (lanes, collisions, traffic) always runs on a straight road. The world is then
// "bent" in the vertex shader: every point ahead of the player is shifted sideways and up/down by
// an amount that depends only on how far ahead it is. The shifts come from a table that is rebuilt
// every frame from a curvature / elevation profile of the road. Shadows and lighting are computed
// on the straight layout, so they stay attached to the objects that cast them.

export const BEND_N = 40; // table samples
export const BEND_STEP = 10; // metres between samples (so the table reaches 400 m ahead)
const TAU = Math.PI * 2;

export interface Terrain {
  curve: number; // peak curvature in rad/m (0.002 = gentle, 0.006 = mountain hairpins)
  hill: number; // hill height in metres
  p: number[]; // random phases, so every run has a different road
  junctions: number[]; // distances along the road where it must be straight and flat (crossroads)
}
export const makeTerrain = (curve: number, hill: number, junctions: number[] = []): Terrain => ({ curve, hill, junctions, p: Array.from({ length: 6 }, () => Math.random() * TAU) });

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 0 right at a junction, rising to 1 a few hundred metres away from it. */
function awayFromJunction(s: number, T: Terrain) {
  let f = 1;
  for (const j of T.junctions) f = Math.min(f, smooth(0, 170, Math.abs(s - j)));
  return f;
}
/** Road curvature at distance s from the start (positive = curving right). */
export function curvatureAt(s: number, T: Terrain) {
  const straights = smooth(-0.15, 0.45, Math.sin(s * TAU / 1900 + T.p[0])); // long straight stretches between bends
  const wave = 0.65 * Math.sin(s * TAU / 820 + T.p[1]) + 0.45 * Math.sin(s * TAU / 370 + T.p[2]);
  return T.curve * straights * wave * smooth(0, 350, s) * awayFromJunction(s, T); // the first 350 m are straight
}
/** Road height at distance s from the start. */
export function elevationAt(s: number, T: Terrain) {
  return T.hill * smooth(0, 300, s) * awayFromJunction(s, T) * (0.7 * Math.sin(s * TAU / 900 + T.p[3]) + 0.5 * Math.sin(s * TAU / 430 + T.p[4]));
}

const DECL = `
uniform vec2 uBend[${BEND_N}];
uniform float uBendBase;
uniform float uBendAmt;
vec4 bendMV( vec4 p ) {
  float f = max( -p.z - uBendBase, 0.0 ) * ${(1 / BEND_STEP).toFixed(4)};
  float fi = min( floor( f ), ${BEND_N - 2}.0 );
  float t = min( f - fi, 1.0 );
  int i = int( fi );
  p.xy += mix( uBend[ i ], uBend[ i + 1 ], t ) * uBendAmt;
  return p;
}
`;
const PROJECT = `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
mvPosition = bendMV( mvPosition );
gl_Position = projectionMatrix * mvPosition;
`;
const SPRITE_FROM = "vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );";

export class Bend {
  uniforms = {
    uBend: { value: Array.from({ length: BEND_N }, () => new THREE.Vector2()) },
    uBendBase: { value: 8.6 }, // distance from the camera to the player; nothing nearer than this is bent
    uBendAmt: { value: 1 }
  };
  /** Curvature under the player right now (used to push the car outwards in bends). */
  curvature = 0;

  /** Make a material follow the bend. Materials flagged userData.noBend (sky, rain) are left alone. */
  patch(m: THREE.Material) {
    if (m.userData.bent || m.userData.noBend) return;
    m.userData.bent = true;
    const u = this.uniforms;
    const sprite = (m as THREE.SpriteMaterial).isSpriteMaterial;
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace("void main() {", DECL + "void main() {");
      shader.vertexShader = sprite
        ? shader.vertexShader.replace(SPRITE_FROM, SPRITE_FROM + "\nmvPosition = bendMV( mvPosition );")
        : shader.vertexShader.replace("#include <project_vertex>", PROJECT);
    };
    m.needsUpdate = true;
  }
  patchAll(root: THREE.Object3D) {
    root.traverse(o => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => this.patch(x));
    });
  }

  /** Rebuild the shift table for a player who is s metres along the road. */
  update(s0: number, T: Terrain) {
    const table = this.uniforms.uBend.value;
    const e0 = elevationAt(s0, T), slope = (elevationAt(s0 + 1, T) - elevationAt(s0 - 1, T)) / 2;
    this.curvature = curvatureAt(s0, T);
    const sub = 2.5;
    let h = 0, x = 0;
    table[0].set(0, 0);
    for (let i = 1; i < BEND_N; i++) {
      for (let k = 0; k < BEND_STEP / sub; k++) {
        const s = s0 + (i - 1) * BEND_STEP + k * sub;
        h += curvatureAt(s + sub / 2, T) * sub; // heading change
        x += Math.sin(h) * sub; // sideways drift
      }
      const d = i * BEND_STEP;
      // the slope under the car is removed, so the road beneath it is level; only crests and dips ahead show
      table[i].set(x, elevationAt(s0 + d, T) - e0 - slope * d);
    }
  }
}
