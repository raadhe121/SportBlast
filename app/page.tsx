import { games } from "@/lib/games";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Game Hub</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">Pick a game to play.</p>
      <ul className="mt-8 grid gap-6 sm:grid-cols-2">
        {games.map((game) => (
          <li
            key={game.id}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-2xl font-semibold">{game.title}</h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">{game.description}</p>
            <span className="mt-4 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize dark:bg-zinc-800">
              {game.orientation}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
