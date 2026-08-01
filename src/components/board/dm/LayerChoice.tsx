import type { ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import type { PublicToken } from '@convex/lib/board'

/**
 * Taken from the server's own token shape rather than spelled out again. This is the field
 * that decides secrecy, so a third literal of the union is the last thing that should be
 * able to drift from the one the mutation validates against. `convex/lib/board.ts` keeps a
 * `TokenLayer` of its own for `setTokenLayer`'s signature and deliberately does **not**
 * export it — partly because the browser is not its consumer, partly because an exported
 * one put a second `TokenLayer` in auto-import range beside the Konva component of that
 * name. Both spellings come from `tokenLayerValidator`, by two routes, and this is the
 * route the client already has.
 *
 * Exported from here because the two writers of it — `board.addToken` through
 * `TokenAddDialog`, `board.setLayer` through `TokenEditPanel` — used to declare it once
 * each, with a docblock each, and two declarations of one union is two places for it to be
 * widened by hand.
 */
export type Layer = PublicToken['layer']

/**
 * The heading over the DM-layer warning, in **one** spelling.
 *
 * ⚠️ **The descriptions are deliberately per-caller and this sentence deliberately is
 * not.** Creating a coin on the DM layer and moving an existing one there say different
 * things about reversibility — one is about a mistake to check before saving, the other
 * about a press that puts everything back — so the body copy belongs beside each control.
 * The title is the *same* fact both times, and it is the app's broadest secrecy write, so
 * the two wordings this shipped with (`will be sent` here, `is being sent` next door) were
 * one edit away from disagreeing about what a DM-layer token is.
 */
export const DM_LAYER_ALERT_TITLE = 'Nobody else will be sent this token at all'

/**
 * Who can see this coin: the two-button picker, shared by the add dialog and the editor.
 *
 * **Two buttons rather than a select, and they say what happens rather than naming a
 * layer.** A hero accidentally created on the DM layer is invisible to the person playing
 * it, and an ambush created on the player layer is spoiled the instant it exists — both
 * mistakes are one click apart, so neither choice is allowed to be jargon.
 *
 * ⚠️ **This is the layer half of the same argument `requireTokenAppearance` makes on the
 * server** (see `TokenAppearanceFields`): the layers a DM may *create on* and may *move
 * to* are one set, so they are one control. What is **not** here is the alert underneath —
 * only its title is, above — because the two callers genuinely say different things about
 * reversibility.
 *
 * Both buttons stay live in both states. Pressing the one already chosen is a no-op the
 * server suppresses (`setTokenLayer` returns early rather than patching) and is local
 * state in the dialog, so there is nothing to guard against — and a disabled button here
 * would only hide which of the two is current from anybody who cannot see colour.
 */
export function LayerChoice({
  layer,
  onChange,
  disabled,
}: {
  layer: Layer
  onChange: (layer: Layer) => void
  /** Any call in flight. The whole picker goes inert rather than one half of it. */
  disabled: boolean
}): ReactElement {
  return (
    // `aria-pressed` as well as the variant, because a button that looks chosen and does
    // not say so is a button a screen reader reads as an ordinary one — the same point
    // `PickerRow` makes.
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        size="sm"
        variant={layer === 'player' ? 'default' : 'outline'}
        aria-pressed={layer === 'player'}
        disabled={disabled}
        onClick={() => onChange('player')}
      >
        Everyone
      </Button>
      <Button
        type="button"
        size="sm"
        variant={layer === 'dm' ? 'destructive' : 'outline'}
        aria-pressed={layer === 'dm'}
        disabled={disabled}
        onClick={() => onChange('dm')}
      >
        Only me — DM layer
      </Button>
    </div>
  )
}
