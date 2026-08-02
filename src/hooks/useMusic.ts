import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex/react'

import {
  getMusicMuted,
  getMusicVolume,
  rememberMusicMuted,
  rememberMusicVolume,
} from '@/lib/session'
import { debounce } from '@/lib/throttle'
import { api } from '@convex/_generated/api'
import type { PublicTrack } from '@convex/lib/music'

/**
 * What a browser with nothing remembered opens at.
 *
 * Half rather than full, because the music is under a conversation: it is the thing you
 * turn *up* if you want it, and a track that arrives at full volume over somebody's
 * headphones is the reason they turn the feature off for good.
 */
const DEFAULT_VOLUME = 0.5

/**
 * How still the slider has to be before the volume is written to local storage.
 *
 * `usePaneWidth`'s number and `usePaneWidth`'s argument: a drag lands a value dozens of
 * times a second and `localStorage.setItem` is synchronous and disk-backed, so a trailing
 * timer collapses the whole gesture into one write. Restated here rather than imported
 * from that hook, which restated it rather than importing from `useBoardCamera` — this is
 * the third instance, so the comment there predicting an extraction into `lib/throttle.ts`
 * beside `SETTINGS_DEBOUNCE_MS` is now due. It is left for a change that owns all three.
 */
const PERSIST_DELAY_MS = 250

export type Music = {
  /**
   * The track the DM has put on the table, or null for none.
   *
   * A subscription that has not arrived collapses into the same `null`, deliberately: the
   * difference is one frame in which a button is not on screen yet, against a third state
   * every reader of this hook would have to branch on.
   */
  track: PublicTrack | null
  /**
   * Whether **this browser** is playing. Nothing is published about it and nothing about
   * anybody else's is known — see the ⚠️ on the hook.
   */
  playing: boolean
  volume: number
  muted: boolean
  /** Play if paused, pause if playing. A no-op when there is no track. */
  toggle: () => void
  /** Clamped to 0..1 here, so no caller has to know the element throws outside it. */
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
}

/**
 * The DM's music, for one browser: which track is on, and this listener's own controls
 * over it.
 *
 * ⚠️ **What is shared is the *pointer* and nothing else.** `music.select` broadcasts which
 * track the DM has put on the table; whether it is playing, how far through it is and how
 * loud it is are this browser's business alone, and no field anywhere records any of them.
 * Two independent reasons hold that line, and both are worth keeping in view because
 * losing either is how this quietly becomes the wrong milestone:
 *
 *  - **Scope.** Synced playback — a shared playhead, a pause everybody feels — is the
 *    tools-and-polish milestone. It needs a clock, a drift policy and an answer for the
 *    client that joins mid-track, and none of those are decided.
 *  - **The platform.** A browser refuses to begin audio without a user gesture *in that
 *    browser*. So a server that wanted to start the music could not: every client would
 *    still be waiting for its own click, and a "playing" flag would be a lie on every
 *    screen where nobody had pressed anything. That is why playback **starts paused and
 *    needs a click** — it is the platform's rule at least as much as a scope decision.
 *
 * ⚠️ **This hook owns an audio element, so where it is called decides whether the music
 * survives.** It must be called from a component that is mounted for the whole session —
 * `GameHeader` — and never from a tab. `RightPane` force-mounts only the sheet tab, so a
 * control living in `SettingsTab` would be unmounted the moment anybody looked at the
 * feed, this hook's cleanup would run, and the music would stop with no visible cause.
 */
export function useMusic(code: string): Music {
  const current = useQuery(api.music.current, { code })
  const track = current ?? null
  const url = track?.url ?? null

  /**
   * ⚠️ **One element, constructed here rather than rendered as JSX**, which is the only
   * arrangement that keeps the promise in the docblock above. An `<audio>` tag would have
   * to live in somebody's markup and be reached through a ref, so the element's lifetime
   * would belong to whichever component happened to render it — and the whole point is
   * that it belongs to this hook. A detached `HTMLAudioElement` plays perfectly well; it
   * has nothing to draw, so there is nothing for the DOM to gain by holding it.
   */
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [playing, setPlaying] = useState(false)
  const [volume, setVolumeState] = useState(() => getMusicVolume(code) ?? DEFAULT_VOLUME)
  const [muted, setMutedState] = useState(() => getMusicMuted(code) ?? false)

  // Both preferences are per game, and a lazy initialiser runs once — so a browser that
  // moves between games without this component remounting would carry the first game's
  // settings into the second. Re-reading costs two storage hits per game.
  useEffect(() => {
    setVolumeState(getMusicVolume(code) ?? DEFAULT_VOLUME)
    setMutedState(getMusicMuted(code) ?? false)
  }, [code])

  useEffect(() => {
    const audio = new Audio()
    // Background music at a table is an ambient loop, and the alternative is a track that
    // stops after four minutes with nobody watching for it. A playback property of this
    // one element, not a fact about the game.
    audio.loop = true
    // ⚠️ **Nothing is fetched until somebody presses play.** A track is up to ten
    // megabytes, and the default would have every client in the game download the whole
    // file the instant the DM selects one — including the players who never turn the
    // music on. It costs a moment of buffering after the first click, which is the right
    // side of that trade.
    audio.preload = 'none'
    audioRef.current = audio

    // ⚠️ **The element is the source of truth for `playing`, never the button.** A
    // `setPlaying(true)` beside a `play()` call would leave a button reading *Pause* over
    // silence the moment the browser refused, which is precisely the case this control has
    // to survive.
    const sync = () => setPlaying(!audio.paused)
    audio.addEventListener('play', sync)
    audio.addEventListener('pause', sync)
    audio.addEventListener('ended', sync)

    return () => {
      audio.removeEventListener('play', sync)
      audio.removeEventListener('pause', sync)
      audio.removeEventListener('ended', sync)
      // Stopped and emptied rather than merely dropped. An element left with a source is
      // an element that may still be holding a connection open, and garbage collection is
      // not a thing to leave the sound of a tavern depending on.
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
      setPlaying(false)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    audio.muted = muted
  }, [volume, muted])

  /**
   * The one place `play()` is called, so a refusal is handled the same way for the button
   * and for a track swap. It rejects for two reasons that actually happen: no user gesture
   * yet, and a file this browser cannot decode. Neither is worth more than a console line
   * — the button comes straight back to *Play*, which is the honest thing for it to say.
   */
  const start = useCallback((audio: HTMLAudioElement) => {
    void audio.play().catch((error: unknown) => {
      setPlaying(false)
      console.error('Music: that track would not play in this browser.', error)
    })
  }, [])

  // Read by the swap below without putting `playing` in its dependencies, which would make
  // every pause re-assign the source and start the track over from the beginning.
  const playingRef = useRef(false)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // The DM has taken the music off. Stopping is the whole of what that means here —
    // there is no "paused at 2:14 waiting for the next one", because there is nothing on.
    if (url === null) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }

    // A different track while this one is playing swaps the source and carries on, which
    // is what a DM changing the music mid-scene means by it. Somebody who had *not*
    // pressed play stays silent: the new track is theirs to start, exactly as the old one
    // was.
    const wasPlaying = playingRef.current
    audio.src = url
    if (wasPlaying) start(audio)
  }, [start, url])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || url === null) return
    if (audio.paused) start(audio)
    else audio.pause()
  }, [start, url])

  // `debounce` from lib/throttle, held in a ref so its identity survives a re-render —
  // `usePaneWidth` carries the long version of both halves, including why the code travels
  // as an argument rather than being read out of a closure at flush time.
  const persistRef = useRef<ReturnType<typeof debounce<[string, number]>> | null>(null)
  if (persistRef.current === null) {
    persistRef.current = debounce(rememberMusicVolume, PERSIST_DELAY_MS)
  }
  const persistVolume = persistRef.current

  // Unmount only, and deliberately not `usePaneWidth`'s three: what a lost flush costs
  // here is the last 250 ms of a slider drag, and the person is looking at the slider. A
  // `pagehide` listener and a `visibilitychange` listener for that would be two global
  // listeners per game to save a preference nobody would notice was a notch out.
  useEffect(() => () => persistVolume.flush(), [persistVolume])

  const setVolume = useCallback(
    (next: number) => {
      // `HTMLMediaElement.volume` *throws* outside 0..1 and on a NaN, so this is what
      // keeps a bad number a quiet no-op rather than an exception in a header that is on
      // screen for the whole session. The slider cannot produce one; this is a public
      // member of the hook.
      if (!Number.isFinite(next)) return
      const bounded = Math.min(1, Math.max(0, next))
      setVolumeState(bounded)
      persistVolume(code, bounded)
    },
    [code, persistVolume],
  )

  const setMuted = useCallback(
    (next: boolean) => {
      setMutedState(next)
      // Written straight through rather than debounced: mute is a discrete press with no
      // run of input to wait out, which is the distinction `debounce`'s own docblock draws
      // between a settings field and a checkbox.
      rememberMusicMuted(code, next)
    },
    [code],
  )

  return { track, playing, volume, muted, toggle, setVolume, setMuted }
}
