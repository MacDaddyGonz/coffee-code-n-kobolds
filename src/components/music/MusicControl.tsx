import type { ReactElement } from 'react'
import { MusicIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useMusic } from '@/hooks/useMusic'

export type MusicControlProps = {
  code: string
}

/**
 * What the table hears: the track the DM has put on, and this listener's own play, mute and
 * volume.
 *
 * ⚠️ **Mounted in `GameHeader` and nowhere else, and that is not a layout preference.**
 * `useMusic` owns the audio element, so this component's lifetime is the music's lifetime —
 * and `RightPane` force-mounts only the sheet tab, so the same three buttons in
 * `SettingsTab` would be unmounted the instant anybody looked at the feed, taking the sound
 * with them. The element and the button that starts it belong in the one component that is
 * on screen for the whole session; splitting them is what this comment exists to prevent.
 *
 * **Nothing here starts playing by itself**, so the first press is always somebody's own.
 * See the ⚠️ on `music.select` for the two reasons.
 *
 * Renders nothing at all when there is no track, rather than a dead control with a
 * disabled button: a game with no music is the ordinary case, and the header's space is the
 * map's.
 */
export function MusicControl({ code }: MusicControlProps): ReactElement | null {
  const { track, playing, volume, muted, toggle, setVolume, setMuted } = useMusic(code)

  if (!track) return null

  // The blob has gone out from under the row — `publicTrack` returns a null url rather than
  // throwing, so the name is still here to be recognised and deleted. Saying so beside the
  // name is the only way a DM finds out; a silent button that does nothing is the failure
  // this exists instead of.
  const missing = track.url === null

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={missing}
        aria-label={playing ? `Pause ${track.name}` : `Play ${track.name}`}
        title={
          missing
            ? 'That track’s file is missing.'
            : playing
              ? `Pause ${track.name}`
              : `Play ${track.name} — just for you`
        }
        onClick={toggle}
      >
        {missing ? (
          <MusicIcon aria-hidden />
        ) : playing ? (
          <PauseIcon aria-hidden />
        ) : (
          <PlayIcon aria-hidden />
        )}
      </Button>

      {/* `title` as well as the text, because the name is truncated and a tavern loop's
          filename is exactly the sort of thing that runs long. */}
      <span className="text-muted-foreground max-w-40 truncate text-xs" title={track.name}>
        {missing ? `${track.name} — file missing` : track.name}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={missing}
        aria-label={muted ? 'Unmute the music' : 'Mute the music'}
        title={muted ? 'Unmute the music' : 'Mute the music'}
        onClick={() => setMuted(!muted)}
      >
        {muted ? <VolumeXIcon aria-hidden /> : <Volume2Icon aria-hidden />}
      </Button>

      {/* A native range rather than a slider primitive: this project has no `Slider` in
          `components/ui`, and adding one for a control this size would be a dependency
          bought for a header. `step` is a twentieth, which is as fine as anybody can hear
          themselves choosing.

          It shows the *stored* volume while muted rather than zero, because mute is a
          separate state and the number under it is what unmuting comes back to. */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={missing}
        aria-label="Music volume"
        title="Music volume — yours alone"
        className="accent-primary h-1 w-20 cursor-pointer"
        onChange={(event) => {
          const next = Number(event.target.value)
          setVolume(next)
          // Turning it up is what somebody means by wanting to hear it, so it unmutes.
          // Leaving them muted here is the state where the slider moves and nothing
          // happens, with the reason two buttons away.
          if (muted && next > 0) setMuted(false)
        }}
      />
    </div>
  )
}
