import { useParams } from 'react-router'

export default function Game() {
  const { code } = useParams<{ code: string }>()

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Game {code}</h1>
      <p className="text-neutral-600">
        Placeholder. The game board lives here — map, feed, panels, tools.
      </p>
    </main>
  )
}
