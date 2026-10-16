import type { GameFactory } from "@/lib/game-contract";

interface DemoConfig {
  title: string;
  hint: string;
  color: number;
  seconds: number;
}

// Placeholder gameplay: tap/click the target as many times as you can before time runs out.
// Real games replace this by default-exporting their own GameFactory.
export function createDemoGame({ title, hint, color, seconds }: DemoConfig): GameFactory {
  return async ({ container, width, height, onGameOver }) => {
    const Phaser = (await import("phaser")).default;

    class DemoScene extends Phaser.Scene {
      score = 0;
      left = seconds;

      create() {
        const text = (y: number, s: string, size: number) =>
          this.add.text(width / 2, y, s, { fontSize: `${size}px`, color: "#fff" }).setOrigin(0.5);
        text(70, title, 48);
        text(125, hint, 24);
        const scoreText = text(height - 60, "Score: 0", 36);
        const timeText = text(190, `${seconds}`, 40);

        const target = this.add.circle(width / 2, height / 2, 70, color).setInteractive();
        target.on("pointerdown", () => {
          this.score++;
          scoreText.setText(`Score: ${this.score}`);
          target.setPosition(
            Phaser.Math.Between(120, width - 120),
            Phaser.Math.Between(260, height - 140),
          );
        });

        this.time.addEvent({
          delay: 1000,
          repeat: seconds - 1,
          callback: () => {
            timeText.setText(`${--this.left}`);
            if (this.left === 0) onGameOver(this.score);
          },
        });
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width,
      height,
      backgroundColor: "#111827",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: DemoScene,
    });

    return { destroy: () => game.destroy(true) };
  };
}
