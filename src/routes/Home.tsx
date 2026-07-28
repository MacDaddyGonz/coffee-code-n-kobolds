import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'

export default function Home() {
  const pings = useQuery(api.ping.list)
  const addPing = useMutation(api.ping.add)
  const [name, setName] = useState('')

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Coffee, Code n' Kobolds</h1>
        <p className="text-neutral-600">
          Scaffolding smoke test. Open this page in two browser tabs — a ping sent in one should
          appear in the other immediately, with no refresh. That proves the whole pipeline.
        </p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          void addPing({ name: trimmed })
          setName('')
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className="flex-1 rounded border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
        >
          Send ping
        </button>
      </form>

      <section>
        {pings === undefined ? (
          <p className="text-neutral-500">Connecting to Convex…</p>
        ) : pings.length === 0 ? (
          <p className="text-neutral-500">No pings yet. Send one.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {pings.map((ping) => (
              <li key={ping._id} className="flex justify-between py-2">
                <span className="font-medium">{ping.name}</span>
                <time className="text-neutral-500">
                  {new Date(ping._creationTime).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-auto text-sm text-neutral-500">
        {/* Proves hash routing survives a hard refresh on GitHub Pages. */}
        <Link to="/game/DEMO01" className="underline">
          Open a placeholder game board →
        </Link>
      </footer>
    </main>
  )
}
