"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GAME_HEIGHT, GAME_WIDTH, type GameInstance } from "@/lib/game-contract";
import { gameLoaders } from "@/lib/game-loaders";
import type { Game } from "@/lib/games";
import { getBestScore, submitScore } from "@/lib/scores";

type Result = { score: number; best: number; isNewBest: boolean; title?: string; note?: string };

export default function GameHost({ game }: { game: Game }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [round, setRound] = useState(0); // bump to restart
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let instance: GameInstance | undefined;
    setLoading(true);
    setError(false);

    gameLoaders[game.id]()
      .then((mod) =>
        mod.default({
          container,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          onGameOver: (score, info) => {
            if (cancelled) return;
            const isNewBest = submitScore(game.id, score);
            setResult({ score, best: getBestScore(game.id), isNewBest, title: info?.title, note: info?.note });
          },
        }),
      )
      .then((inst) => {
        if (cancelled) inst.destroy();
        else {
          instance = inst;
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setError(true));

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [game.id, round]);

  const playAgain = () => {
    setResult(null);
    setRound((r) => r + 1);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      {/* 16:9 area, as large as fits the screen */}
      <div
        className="relative max-h-full max-w-full"
        style={{ aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}`, width: "min(100vw, calc(100vh * 16 / 9))" }}
      >
        <div ref={containerRef} className="absolute inset-0 touch-none select-none [&>canvas]:!h-full [&>canvas]:!w-full" />

        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white">Loading…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
            <p>Couldn&apos;t load {game.title}.</p>
            <Link href="/" className="rounded-full bg-white px-5 py-2 font-medium text-black">
              Back to hub
            </Link>
          </div>
        )}

        {!result && !loading && !error && (
          <Link
            href="/"
            className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-sm text-white hover:bg-black/70"
          >
            ← Hub
          </Link>
        )}

        {result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-72 max-w-[90%] rounded-2xl bg-white p-6 text-center text-black">
              <h2 className="text-2xl font-bold">{result.title ?? "Game over"}</h2>
              {result.note && <p className="mt-1 text-sm text-zinc-600">{result.note}</p>}
              <p className="mt-3 text-4xl font-bold">{result.score}</p>
              <p className="mt-1 text-sm text-zinc-600">
                {result.isNewBest ? "New best score!" : `Best: ${result.best}`}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={playAgain}
                  className="rounded-full bg-black px-5 py-2 font-medium text-white"
                >
                  Play again
                </button>
                <Link href="/" className="rounded-full border border-zinc-300 px-5 py-2 font-medium">
                  Back to hub
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
