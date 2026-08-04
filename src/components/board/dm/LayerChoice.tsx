import type { ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import type { TokenLayer } from '@convex/lib/layers'
import { TOKEN_LAYERS, TOKEN_LAYER_LABELS, maySeeLayer } from '@convex/lib/layers'

/**
 * The heading over each layer's warning, in **one** spelling per layer, and `null` for the
 * layer that needs no warning at all. Exhaustive by construction — see CLAUDE.md
 * invariant 9, and note that this is the field that decides secrecy: the lone
 * `DM_LAYER_ALERT_TITLE` this replaced would have let a new layer draw *no* warning at all
 * and look finished doing it.
 *
 * ⚠️ **The descriptions are deliberately per-caller and these sentences deliberately are
 * not.** Creating a coin on the GM layer and moving an existing one there say different
 * things about reversibility — one is about a mistake to check before saving, the other
 * about a press that puts everything back — so the body copy belongs beside each control.
 * The titles are the *same* fact both times, and the GM one is the app's broadest secrecy
 * write, so the two wordings it shipped with (`will be sent` in the dialog, `is being sent`
 * next door) were one edit away from disagreeing about what a hidden token is.
 *
 * Background gets a title of its own rather than sharing the player layer's silence,
 * because it is the layer whose consequence is genuinely surprising: everybody sees it and
 * nobody but the DM can pick it up, which is the first time in this application that sight
 * and interaction have parted company.
 */
export const LAYER_ALERT_TITLES: Record<TokenLayer, string | null> = {
  background: 'Everybody sees it, and nobody else can pick it up',
  player: null,
  gm: 'Nobody else will be sent this token at all',
}

/**
 * Who can see this coin, and who can move it: the picker shared by the add dialog and the
 * editor.
 *
 * **Buttons rather than a select, and they say what happens rather than naming a layer.** A
 * hero accidentally created on the GM layer is invisible to the person playing it, an ambush
 * created on the player layer is spoiled the instant it exists, and a monster left on
 * Background is one the party can see and its own player cannot drag — three mistakes one
 * click apart, so none of the choices is allowed to be jargon. The words come from
 * `TOKEN_LAYER_LABELS` beside the union itself, for the reason that record gives.
 *
 * The union is iterated rather than three buttons written out — CLAUDE.md invariant 9.
 *
 * ⚠️ **This is the layer half of the same argument `requireTokenAppearance` makes on the
 * server** (see `TokenAppearanceFields`): the layers a DM may *create on* and may *move to*
 * are one set, so they are one control. What is **not** here is the alert underneath — only
 * its title is, above — because the two callers genuinely say different things.
 *
 * Every button stays live in every state. Pressing the one already chosen is a no-op the
 * server suppresses (`setTokenLayer` returns early rather than patching) and is local state
 * in the dialog, so there is nothing to guard against — and a disabled button here would
 * only hide which one is current from anybody who cannot see colour.
 */
export function LayerChoice({
  layer,
  onChange,
  disabled,
}: {
  layer: TokenLayer
  onChange: (layer: TokenLayer) => void
  /** Any call in flight. The whole picker goes inert rather than one part of it. */
  disabled: boolean
}): ReactElement {
  return (
    // Stacked rather than a grid of equal columns, because the labels are sentences of very
    // different lengths — `Everyone` beside `Scenery — everyone sees it, nobody else moves
    // it` in two columns is one button of white space and one of wrapped text.
    //
    // `aria-pressed` as well as the variant, because a button that looks chosen and does not
    // say so is a button a screen reader reads as an ordinary one — the same point
    // `PickerRow` makes.
    <div className="flex flex-col gap-2">
      {TOKEN_LAYERS.map((choice) => {
        const chosen = choice === layer
        // Red for the layer nobody else is sent, read off the shared predicate rather than
        // by naming the GM layer: the thing that makes a choice alarming is precisely that
        // it withholds the coin, so a future secret layer inherits the colour with the rule.
        const withheld = !maySeeLayer(choice)

        return (
          <Button
            key={choice}
            type="button"
            size="sm"
            variant={chosen ? (withheld ? 'destructive' : 'default') : 'outline'}
            aria-pressed={chosen}
            disabled={disabled}
            onClick={() => onChange(choice)}
          >
            {TOKEN_LAYER_LABELS[choice]}
          </Button>
        )
      })}
    </div>
  )
}
