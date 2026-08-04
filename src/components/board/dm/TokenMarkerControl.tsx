import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Button } from '@/components/ui/button'
import { markersArgs } from '@/hooks/useBoard'
import { PIP_INK, TOKEN_MARKER_PIPS } from '@/lib/markers'
import { api } from '@convex/_generated/api'
import type { PublicToken } from '@convex/lib/board'
import type { TokenMarker } from '@convex/lib/markers'
import { TOKEN_MARKERS, TOKEN_MARKER_LABELS } from '@convex/lib/markers'

export type TokenMarkerControlProps = {
  code: string
  dmCode: string
  token: PublicToken
}

/**
 * What is happening to this coin: the seventeen conditions, ticked on and off.
 *
 * ⚠️ **They are labels and nothing else, and that sentence is the whole design rather
 * than a caveat on it.** Nothing in `convex/` reads a marker — no roll consults one, no
 * health band is computed from one, no drag is refused because of one, and no query
 * filters on one — and `markerGuard.test.ts` is what makes that a promise instead of an
 * intention: it greps `convex/` for a quoted specifier reaching the vocabulary and allows
 * exactly three importers. The body copy below says so on screen, in the DM's words, at
 * the control that causes it, because a grid of D&D conditions in a virtual tabletop
 * reads as a rules engine unless it says otherwise.
 *
 * ⚠️ **`board.markers` is subscribed here with the shared builder, which is not
 * stylistic.** Convex keys a query by its arguments, so this panel and the board in the
 * other pane must *name the same cache entry* or the screen holds two — two socket
 * subscriptions, two server executions, and the DM's own tick landing on the panel a beat
 * before it lands on the coin. `markersArgs` is what makes them one; see its docblock.
 * The query is game-scoped and reads no `tokenPositions` row, so this costs one more
 * reader of a socket the board is already holding and no server execution at all.
 *
 * ⚠️ **The write is absolute** — the next array is built from the current one and all of
 * it is sent — which is `setControllers`' argument verbatim: two clients racing on one
 * coin end with one of the two intentions rather than an interleaving of both, and
 * clearing everything is expressible as `[]`, which is the value that deletes the row
 * rather than storing an empty array.
 *
 * **`TOKEN_MARKERS` is iterated against the two `Record`s and seventeen entries are never
 * written out in JSX**, which is CLAUDE.md invariant 9's formulation. Seventeen
 * hand-written buttons is the arrangement where an eighteenth condition is storable,
 * drawable on a coin, and has no box anybody can tick or untick it with. Nothing here
 * guards a secret: `visibleMarkers` already refused a player the rows for a coin they may
 * not see, and this panel is the DM's.
 *
 * **The gate is not this panel's to state.** `board.setMarkers` runs
 * `requireMovableToken`, so whoever may drag a coin may mark it — a decision rather than a
 * shortcut, argued on that mutation — and the second sentence of the copy is that fact in
 * the DM's words rather than a rule this file implements.
 */
export function TokenMarkerControl({
  code,
  dmCode,
  token,
}: TokenMarkerControlProps): ReactElement {
  const rows = useQuery(api.board.markers, markersArgs(code, dmCode))
  const setMarkers = useMutation(api.board.setMarkers)
  const action = useLobbyAction()

  // The query answers for every coin in the game, because it is one subscription for a
  // whole board of pips; this panel is about one of them. A find rather than a `Map`,
  // since there is exactly one lookup and the rows are only the *marked* coins.
  const current = useMemo<readonly TokenMarker[]>(
    () => rows?.find((row) => row.tokenId === token._id)?.markers ?? [],
    [rows, token._id],
  )
  const on = useMemo(() => new Set(current), [current])

  // Nothing to send until the current state has arrived: an absolute write built from an
  // array that has not landed would clear every condition on the coin in the act of
  // ticking one.
  const busy = action.pending !== null || rows === undefined

  function toggle(marker: TokenMarker) {
    const next = on.has(marker) ? current.filter((held) => held !== marker) : [...current, marker]

    void action.run(
      `marker:${marker}`,
      `Could not change what is happening to ${token.name}.`,
      () => setMarkers({ code, dmCode, tokenId: token._id, markers: next }),
      // A field rather than a toast: the grid stays on screen after a refusal, so there is
      // something for the message to be about and the DM can see which press did not take.
      { report: 'field' },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-medium">Labels, and nothing else.</span> Nothing
        in the app reads one: no roll consults it, no health is computed from it, and no drag
        is refused because of it. They are on the coin so the table can see them; the rules are
        yours.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {TOKEN_MARKERS.map((marker) => {
          const held = on.has(marker)
          const pip = TOKEN_MARKER_PIPS[marker]

          return (
            <Button
              key={marker}
              type="button"
              size="sm"
              variant={held ? 'default' : 'outline'}
              aria-pressed={held}
              disabled={busy}
              onClick={() => toggle(marker)}
            >
              {/* The same glyph and the same fill the board draws, from the same record, so
                  the DM is ticking the pip they will see rather than learning a second
                  alphabet. Marked `aria-hidden` because the label beside it is the reading
                  that counts — a single letter at this size is a reminder, not a name. */}
              <span
                aria-hidden
                className="flex size-4 items-center justify-center rounded-full text-[0.55rem] font-bold"
                style={{ backgroundColor: pip.fill, color: PIP_INK }}
              >
                {pip.glyph}
              </span>
              {TOKEN_MARKER_LABELS[marker]}
            </Button>
          )
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        Whoever can drag this coin can also mark it.
      </p>

      <FieldError message={action.error} />
    </div>
  )
}
