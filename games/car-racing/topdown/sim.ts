// Pure race logic (no Phaser) so it can be tested without a browser.

export interface RoundedRect {
  hw: number; // half width
  hh: number; // half height
  r: number; // corner radius
}

export const TRACK = {
  cx: 640,
  cy: 360,
  outer: { hw: 576, hh: 320, r: 150 } as RoundedRect,
  inner: { hw: 333, hh: 102, r: 102 } as RoundedRect, // fully rounded ends (stadium)
};
export const LAPS = 3;
export const FINISH_X = TRACK.cx; // finish line: vertical line across the bottom straight
export const CAR = { w: 44, h: 22 };

const MAX_SPEED = 420;
const OFFROAD_MAX_SPEED = 130;
const ACCEL = 380;
const BRAKE = 700;
const COAST_DRAG = 140;
const OFFROAD_DRAG = 500;

export interface Input {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
}

export interface RaceState {
  x: number;
  y: number;
  angle: number; // radians, 0 = +x, y grows downward
  speed: number;
  lap: number; // completed laps
  checkpoint: boolean; // far-side checkpoint passed since the last finish-line crossing
  time: number;
  finished: boolean;
  offRoad: boolean;
}

function inRoundedRect(x: number, y: number, s: RoundedRect): boolean {
  const dx = Math.max(Math.abs(x - TRACK.cx) - (s.hw - s.r), 0);
  const dy = Math.max(Math.abs(y - TRACK.cy) - (s.hh - s.r), 0);
  return dx * dx + dy * dy <= s.r * s.r;
}

export function isOnRoad(x: number, y: number): boolean {
  return inRoundedRect(x, y, TRACK.outer) && !inRoundedRect(x, y, TRACK.inner);
}

/**
 * Points along a rounded rectangle, evenly spaced, starting at the bottom-middle and
 * running in the racing direction (right along the bottom, i.e. counter-clockwise on screen).
 */
export function trackPath(s: RoundedRect, spacing = 6): { x: number; y: number }[] {
  const { cx, cy } = TRACK;
  const pts: { x: number; y: number }[] = [{ x: cx, y: cy + s.hh }];
  const arc = (ax: number, ay: number, from: number, to: number) => {
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      pts.push({ x: ax + s.r * Math.cos(a), y: ay + s.r * Math.sin(a) });
    }
  };
  arc(cx + s.hw - s.r, cy + s.hh - s.r, Math.PI / 2, 0); // bottom-right
  arc(cx + s.hw - s.r, cy - s.hh + s.r, 0, -Math.PI / 2); // top-right
  arc(cx - s.hw + s.r, cy - s.hh + s.r, -Math.PI / 2, -Math.PI); // top-left
  arc(cx - s.hw + s.r, cy + s.hh - s.r, Math.PI, Math.PI / 2); // bottom-left
  pts.push(pts[0]);

  // Resample to even spacing.
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = spacing - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  return out;
}

export function createRace(): RaceState {
  // Bottom straight, just before the finish line, heading right.
  return {
    x: FINISH_X - 80,
    y: TRACK.cy + (TRACK.inner.hh + TRACK.outer.hh) / 2,
    angle: 0,
    speed: 0,
    lap: 0,
    checkpoint: false,
    time: 0,
    finished: false,
    offRoad: false,
  };
}

export function step(s: RaceState, input: Input, dt: number): void {
  if (s.finished) return;
  s.time += dt;

  s.offRoad = !isOnRoad(s.x, s.y);
  const maxSpeed = s.offRoad ? OFFROAD_MAX_SPEED : MAX_SPEED;

  if (input.gas) s.speed += ACCEL * dt;
  if (input.brake) s.speed -= BRAKE * dt;
  if (!input.gas && !input.brake) s.speed -= COAST_DRAG * dt; // coast
  if (s.offRoad) s.speed -= OFFROAD_DRAG * dt;
  if (s.speed > maxSpeed) s.speed = Math.max(maxSpeed, s.speed - 900 * dt); // bleed off excess
  if (s.speed < 0) s.speed = 0;

  // Steering is stronger at higher speed (and nil when stopped).
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const turnRate = 0.6 + 1.6 * Math.min(1, s.speed / MAX_SPEED);
  s.angle += steer * turnRate * Math.min(1, s.speed / 40) * dt;

  const prevX = s.x;
  s.x += Math.cos(s.angle) * s.speed * dt;
  s.y += Math.sin(s.angle) * s.speed * dt;

  const crossedRight = prevX < FINISH_X && s.x >= FINISH_X;
  const crossedLeft = prevX > FINISH_X && s.x <= FINISH_X;

  // Checkpoint: the far (top) straight, driven in the racing direction (leftwards).
  if (s.y < TRACK.cy && crossedLeft) s.checkpoint = true;

  // Finish line: bottom straight, crossed in the racing direction, only after the checkpoint.
  if (s.y > TRACK.cy && crossedRight && s.checkpoint) {
    s.checkpoint = false;
    s.lap++;
    if (s.lap >= LAPS) s.finished = true;
  }
}

/** Faster = higher. 25 s ≈ 6500 points; each extra second costs 100. */
export function timeToScore(seconds: number): number {
  return Math.max(0, Math.round((90 - seconds) * 100));
}
