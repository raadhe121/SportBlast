import { notFound } from "next/navigation";
import { games } from "@/lib/games";
import GameHost from "./GameHost";

// Static export: one play page is generated per game ID.
export function generateStaticParams() {
  return games.map((g) => ({ id: g.id }));
}

export const dynamicParams = false;

export default async function PlayPage({ params }: PageProps<"/play/[id]">) {
  const { id } = await params;
  const game = games.find((g) => g.id === id);
  if (!game) notFound();
  return <GameHost game={game} />;
}
