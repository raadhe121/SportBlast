import type { GameFactory } from "@/lib/game-contract";
import { CAR, LAPS, TRACK, createRace, step, timeToScore, trackPath, type Input } from "./sim";

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;

const GRASS = 0x3b7a3e;
const ROAD = 0x3a3d4d;
const PANEL = 0x111827;
const ORANGE = 0xfb923c;
const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

const createGame: GameFactory = async ({ container, width, height, onGameOver }) => {
  const Phaser = (await import("phaser")).default;

  class RaceScene extends Phaser.Scene {
    race = createRace();
    keys!: Phaser.Types.Input.Keyboard.CursorKeys;
    touch: Input = { left: false, right: false, gas: false, brake: false };
    car!: Phaser.GameObjects.Container;
    lapText!: Phaser.GameObjects.Text;
    timeText!: Phaser.GameObjects.Text;
    reported = false;

    create() {
      this.drawTrack();

      const body = this.add.graphics();
      body.fillStyle(ORANGE).fillRoundedRect(-CAR.w / 2, -CAR.h / 2, CAR.w, CAR.h, 6);
      body.fillStyle(PANEL).fillRoundedRect(2, -8, 9, 16, 2); // windscreen, at the front
      this.car = this.add.container(this.race.x, this.race.y, [body]);

      this.drawHud();

      this.keys = this.input.keyboard!.createCursorKeys();
      this.input.keyboard!.addCapture("UP,DOWN,LEFT,RIGHT,SPACE");
      this.input.addPointer(3); // multi-touch: steer and gas at once
      if (this.sys.game.device.input.touch) this.addTouchButtons();
    }

    drawTrack() {
      const { cx, cy, outer, inner } = TRACK;
      const g = this.add.graphics();
      g.fillStyle(GRASS).fillRect(0, 0, width, height);
      g.fillStyle(ROAD).fillRoundedRect(cx - outer.hw, cy - outer.hh, outer.hw * 2, outer.hh * 2, outer.r);
      g.fillStyle(GRASS).fillRoundedRect(cx - inner.hw, cy - inner.hh, inner.hw * 2, inner.hh * 2, inner.r);

      // Finish line across the bottom straight.
      g.fillStyle(0xffffff).fillRect(cx - 3, cy + inner.hh, 6, outer.hh - inner.hh);

      // Dashed white line just inside the outer edge.
      const edge = trackPath({ hw: outer.hw - 8, hh: outer.hh - 8, r: outer.r - 8 }, 5);
      g.lineStyle(5, 0xffffff);
      for (let i = 0; i + 6 < edge.length; i += 10) {
        const [first, ...rest] = edge.slice(i, i + 6);
        g.beginPath().moveTo(first.x, first.y);
        for (const p of rest) g.lineTo(p.x, p.y);
        g.strokePath();
      }
    }

    pill(x: number, w: number, label: string) {
      const h = 44;
      this.add.graphics().fillStyle(PANEL, 0.88).fillRoundedRect(x - w, 22, w, h, 12);
      return this.add
        .text(x - w / 2, 22 + h / 2, label, { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: "#fff" })
        .setOrigin(0.5);
    }

    drawHud() {
      this.timeText = this.pill(width - 24, 120, fmt(0));
      this.lapText = this.pill(width - 24 - 120 - 14, 130, `LAP 1 / ${LAPS}`);
    }

    addTouchButtons() {
      const make = (x: number, y: number, r: number, key: keyof Input, fill: number, alpha: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
        const held = new Set<number>();
        const sync = () => (this.touch[key] = held.size > 0);
        const b = this.add.circle(x, y, r, fill, alpha).setStrokeStyle(3, 0xffffff, 0.55).setInteractive();
        const g = this.add.graphics({ x, y });
        draw(g);
        b.on("pointerdown", (p: Phaser.Input.Pointer) => (held.add(p.id), sync()));
        for (const ev of ["pointerup", "pointerout", "pointerupoutside"]) {
          b.on(ev, (p: Phaser.Input.Pointer) => (held.delete(p.id), sync()));
        }
      };
      const chevron = (dir: 1 | -1) => (g: Phaser.GameObjects.Graphics) =>
        g.lineStyle(7, 0xffffff).beginPath().moveTo(-9 * dir, -20).lineTo(11 * dir, 0).lineTo(-9 * dir, 20).strokePath();
      const label = (text: string, size: number, color: string) => (g: Phaser.GameObjects.Graphics) => {
        this.add.text(g.x, g.y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color }).setOrigin(0.5);
      };
      make(96, height - 90, 56, "left", PANEL, 0.8, chevron(-1));
      make(226, height - 90, 56, "right", PANEL, 0.8, chevron(1));
      make(width - 270, height - 86, 56, "brake", PANEL, 0.8, label("BRAKE", 20, "#fff"));
      make(width - 120, height - 100, 76, "gas", ORANGE, 1, label("GO", 30, "#111827"));
    }

    update(_: number, delta: number) {
      const r = this.race;
      const input: Input = {
        left: this.keys.left.isDown || this.touch.left,
        right: this.keys.right.isDown || this.touch.right,
        gas: this.keys.up.isDown || this.touch.gas,
        brake: this.keys.down.isDown || this.touch.brake,
      };
      step(r, input, Math.min(delta / 1000, 0.05));

      this.car.setPosition(r.x, r.y).setRotation(r.angle);
      this.lapText.setText(`LAP ${Math.min(r.lap + 1, LAPS)} / ${LAPS}`);
      this.timeText.setText(fmt(r.time));

      if (r.finished && !this.reported) {
        this.reported = true;
        onGameOver(timeToScore(r.time));
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width,
    height,
    backgroundColor: "#3b7a3e",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: RaceScene,
  });

  return { destroy: () => game.destroy(true) };
};

export default createGame;
