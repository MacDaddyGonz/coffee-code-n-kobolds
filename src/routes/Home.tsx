import { CreateGamePanel } from '@/components/home/CreateGamePanel'
import { JoinGamePanel } from '@/components/home/JoinGamePanel'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold">Coffee, Code n' Kobolds</h1>
        <p className="text-muted-foreground">
          Start a game and share the code, or join one you have been given. No accounts — a game
          code and a display name is the whole of it.
        </p>
      </header>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <CreateGamePanel />
        <JoinGamePanel />
      </div>
    </main>
  )
}
