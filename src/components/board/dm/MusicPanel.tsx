import { useMutation, useQuery } from 'convex/react'

import { ConfirmDialog } from '@/components/lobby/ConfirmDialog'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@convex/_generated/api'
import type { PublicTrack } from '@convex/lib/music'
import { TrackUploadDialog } from './TrackUploadDialog'

export type MusicPanelProps = {
  code: string
  /** Present means this browser holds it; every call below re-verifies it server-side. */
  dmCode: string
}

// WIRING: this panel is not mounted anywhere yet. It wants to be the **Music** sub-tab of
// `src/components/shell/tabs/DmToolsTab.tsx`, which another change owns — mount it as
// `<MusicPanel code={code} dmCode={dmCode} />` beside the map panel.

/**
 * The DM's tracks: what this game has, which one is on the table, and a way to delete one.
 *
 * ⚠️ **"On the table" is the whole of what putting a track on does, and the label is chosen
 * to say so.** *Play for the table* was the obvious wording and it is a lie: this cannot
 * start anybody's audio, because a browser will not begin playing without a gesture in that
 * browser. What the button does is name a track in everybody's header, where each person
 * presses play for themselves — so it borrows `SceneSelect`'s vocabulary, which already
 * describes exactly this relationship between the DM's list and the thing the group is
 * pointed at.
 *
 * Nothing here knows or records whether anybody is listening, and there is deliberately no
 * pause, no seek and no position: synced playback is a later milestone with a clock and a
 * drift policy in it. See the ⚠️ on `useMusic` and on `music.select`.
 *
 * Two subscriptions, both cheap and both low-churn: `music.list` for the DM's own track
 * names, which throws for a caller without the code because a list of them is a spoiler in
 * the way a scene list is, and `music.current` for the one everybody can see. Taking the
 * active track from the open query rather than threading `game.activeTrackId` in keeps this
 * component's props to a code and a secret, exactly as `MapSetupPanel` does.
 *
 * Rendered on the strength of `dm.dmCode` being present, and that display gate authorises
 * nothing — every call inside re-verifies the code server-side (CLAUDE.md invariant 7).
 */
export function MusicPanel({ code, dmCode }: MusicPanelProps) {
  const tracks = useQuery(api.music.list, { code, dmCode })
  const current = useQuery(api.music.current, { code })

  const select = useMutation(api.music.select)
  const removeTrack = useMutation(api.music.remove)
  const action = useLobbyAction()

  const busy = action.pending !== null

  const putOn = (track: PublicTrack) =>
    void action.run('select', `Could not put ${track.name} on.`, () =>
      select({ code, dmCode, trackId: track._id }),
    )

  // Null is the argument that means off, rather than an omitted one — see `music.select`.
  const takeOff = () =>
    void action.run('select', 'Could not take the music off.', () =>
      select({ code, dmCode, trackId: null }),
    )

  const remove = (track: PublicTrack) =>
    action.run(`remove:${track._id}`, `Could not delete ${track.name}.`, () =>
      removeTrack({ code, dmCode, trackId: track._id }),
    )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Music</CardTitle>
        <CardDescription>
          Only you see this list. Putting a track on names it in everybody's header — each
          person presses play for themselves, because a browser will not start audio on its
          own.
        </CardDescription>
        <CardAction>
          <TrackUploadDialog code={code} dmCode={dmCode} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {tracks === undefined || current === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : tracks.length === 0 ? (
          <p className="text-muted-foreground">
            No music yet. Add a loop or two and you can put one on when the scene wants it —
            nothing plays until somebody presses play, yourself included.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tracks.map((track) => {
              const on = current?._id === track._id
              return (
                <li key={track._id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm">{track.name}</span>
                    {on ? <Badge variant="secondary">On the table</Badge> : null}
                    {/* The blob has gone out from under the row. `publicTrack` answers with
                        a null url rather than throwing, so this is the only place a DM can
                        find out and the only row they can act on. */}
                    {track.url === null ? <Badge variant="destructive">File missing</Badge> : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {on ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={takeOff}
                      >
                        Take it off
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => putOn(track)}
                      >
                        Put it on
                      </Button>
                    )}

                    <ConfirmDialog
                      trigger={
                        <Button type="button" variant="destructive" size="sm" disabled={busy}>
                          Delete
                        </Button>
                      }
                      title={`Delete ${track.name}?`}
                      description={
                        on
                          ? 'The audio file goes with it and this cannot be undone. It is the track on the table, so the music comes off everybody’s header — anyone playing it stops there and then.'
                          : 'The audio file goes with it and this cannot be undone. Nothing else in the game points at a track, so nobody hears anything change.'
                      }
                      confirmLabel="Delete the track"
                      busy={action.pending === `remove:${track._id}`}
                      onConfirm={() => remove(track)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
