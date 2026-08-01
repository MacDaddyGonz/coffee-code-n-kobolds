import { Shell } from '@/components/Shell'
import { CreateGamePanel } from '@/components/home/CreateGamePanel'
import { GameList } from '@/components/home/GameList'
import { JoinGamePanel } from '@/components/home/JoinGamePanel'

/**
 * The only pre-game route, and the whole of what happens before a game code is in
 * the URL — including the join conversation, which is a dialog rather than a route
 * of its own. `JoinDoorDialog`'s docblock says why.
 *
 * **The list comes first, full width, and the two panels below it.** The order is
 * the screen's argument: most arrivals are returning to a game that already exists,
 * so recognising it in a list is the cheap correct path and typing a code from memory
 * is the fallback. That is the same ordering `SeatPicker` makes one screen later for
 * the same reason — recognition before recall — and putting the code field first is
 * what makes people reconstruct from memory something that was on screen all along.
 */
export default function Home() {
  return (
    <Shell>
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold">Coffee, Code n' Kobolds</h1>
        <p className="text-muted-foreground">
          Start a game and share the code, or join one you have been given. No accounts — a game
          code and a display name is the whole of it.
        </p>
      </header>

      <GameList />

      <div className="grid items-start gap-6 md:grid-cols-2">
        <CreateGamePanel />
        <JoinGamePanel />
      </div>
    </Shell>
  )
}
