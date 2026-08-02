// THE LAYER VOCABULARY — the union a token's `layer` field holds, and the two pure
// questions asked about it. Shared verbatim by the Convex functions and the browser,
// like lib/grid.ts and lib/limits.ts, and for the same reason: a layer the two sides
// each spell for themselves is two unions.
//
// ⚠️ **What lives here is vocabulary. The decision does not.** `maySee` — the predicate
// that reads a `Doc<'tokens'>` and answers whether this caller may be sent it — stays in
// lib/board.ts, because that is the module CLAUDE.md invariant 8 names as the one reader
// of the two token tables and the one place a reviewer has to read to audit the leak.
// What moved out is a function of a *string*, which no caller can turn into a row.
//
// The split earns its keep on the client. A `Record<TokenLayer, …>` cannot be keyed off a
// payload field's type without the type's name, and those records are what make a fourth
// member fail to compile in the two places the browser decides how to draw and label a
// layer. Value-importing lib/board.ts from `src/` to reach them would drag the whole choke
// point into the bundle for a `switch` over three strings.

import { v, type Infer } from 'convex/values'

/**
 * The three layers a token can be on, **bottom to top**, spelled once.
 *
 * The order is load-bearing twice over. The Konva side renders them in this order, so the
 * array *is* the paint order and a layer cannot be drawn in the wrong place without this
 * list being wrong. And the top member is the secret one, which is what makes the
 * fail-closed answers below the conservative direction rather than an arbitrary one.
 *
 * Requirements.md names the third layer "DM layer"; this stores it as `gm`, Roll20's name
 * for the same thing, because "DM" is already the name of a *person* holding a code in
 * every other identifier in this codebase and a layer that shares that word reads as a
 * layer only the DM can *see* rather than one only the DM can *touch*. Both are true of
 * it, but only one is the thing the schema comment has to say.
 */
export const TOKEN_LAYERS = ['background', 'player', 'gm'] as const
export type TokenLayer = (typeof TOKEN_LAYERS)[number]

/**
 * The same three members as a Convex validator, **hand-spelled rather than derived from
 * the array above**, and the duplication is deliberate.
 *
 * A generated `v.union(...TOKEN_LAYERS.map(v.literal))` would make the two agree by
 * construction, which sounds strictly better and removes the only guard that catches the
 * dangerous direction. The refusals in this file and on the client all fire when a member
 * is added to `TOKEN_LAYERS`; none of them fires when a literal is added to the
 * *validator* alone — and that is the failure that matters, because the schema and
 * `board.addToken` would then accept and store a layer nothing can filter, label or draw.
 * `lib/layers.test.ts` pins the two against each other for membership and order, so the
 * duplication is checked by machine and the check can fail.
 *
 * That is `isMonsterSheet`'s history repeating in the one direction it can still repeat
 * in — see the docblock on it in lib/sheet.ts.
 */
export const tokenLayerValidator = v.union(
  v.literal('background'),
  v.literal('player'),
  v.literal('gm'),
)

/**
 * What the DM's controls call each layer. One record, not three, for the reason
 * `CHARACTER_GROUP_LABELS` gives in lib/sheet.ts: three records make a fourth member fail
 * to compile in three files, and whichever is fixed first looks finished.
 *
 * The *body* copy warning a DM what a layer means stays on the screen that shows it —
 * `TokenAddDialog` and `TokenEditPanel` each say something different about the same layer
 * because each is a sentence about that control. That is the carve-out lib/sheet.ts
 * already makes for a per-screen sentence, and it is not a licence to spell the label
 * twice.
 */
export const TOKEN_LAYER_LABELS: Record<TokenLayer, string> = {
  background: 'Scenery — everyone sees it, nobody else moves it',
  player: 'Everyone',
  gm: 'Only me — GM layer',
}

/**
 * THE SIGHT HALF, as a function of the layer alone.
 *
 * Background and Player are public; GM is the secret. `maySee` in lib/board.ts calls this
 * with `isDm` already short-circuited above it, so this switch is about layers and nothing
 * else — see the docblock there for why that ordering matters.
 *
 * ⚠️ **The runtime default is fail-closed: withhold.** Same direction as `isMonsterSheet`'s
 * `true` and for the same operational reason, which is worth restating because it is not
 * belt-and-braces. A schema push is not atomic across a deployment: a document written by
 * a newer deployment can be read by an older one for the seconds in between, and in that
 * window this function is handed a layer it has never heard of. The union is ordered
 * bottom to top with the secret at the top, so an unrecognised member is presumptively
 * *more* hidden, not less. Getting it wrong this way costs a coin missing from the board
 * for a few seconds; getting it wrong the other way spoils an ambush.
 *
 * It also composes with the mechanical guard in the right order. Because the row is
 * dropped, `publicTokenValidator` never sees the unknown value — so the `returns:`
 * validator does not throw and take the whole table's board query down with it. Were this
 * fail-*open*, the unknown layer would reach the projection and Convex would refuse the
 * payload, turning a stale read into an outage.
 */
export function maySeeLayer(layer: TokenLayer, isDm: boolean): boolean {
  void isDm
  switch (layer) {
    case 'background':
    case 'player':
      return true
    case 'gm':
      return false
    default: {
      const unknownLayer: never = layer
      void unknownLayer
      return false
    }
  }
}

/**
 * MAY A CALLER WHO IS NOT THE DM INTERACT WITH A TOKEN ON THIS LAYER?
 *
 * A second question about the same union, and genuinely a different one — which is why it
 * is a second function rather than a wider `maySeeLayer`. Background is the case that
 * makes them differ: players **see** it and may never **touch** it, which is exactly what
 * requirements.md's map-layer list asks for and exactly what a two-way sight test could
 * not express. Sight and interaction were the same answer while there were two layers, and
 * that coincidence is the reason the union could not simply be widened.
 *
 * Named for the audience it refuses rather than `isInteractive`, because the DM moves
 * scenery around freely — `requireMovableToken` returns for a DM before it gets here, and
 * the roadmap's acceptance is that a Background token cannot be picked up *by them*.
 *
 * ⚠️ **Fail-closed here too, and it is a different trade worth stating separately.** An
 * over-refusal costs one drag and a confused player; an under-refusal hands the party the
 * DM's scenery, or an unrevealed marker on a layer that has not been invented yet.
 */
export function mayPlayersMove(layer: TokenLayer): boolean {
  switch (layer) {
    case 'player':
      return true
    case 'background':
    case 'gm':
      return false
    default: {
      const unknownLayer: never = layer
      void unknownLayer
      return false
    }
  }
}

// ─── TRANSITION ONLY ────────────────────────────────────────────────────────────────
// Everything below exists to carry the rename of the GM layer's stored value from `dm` to
// `gm` across a schema push, and is deleted once the relabel has run against every
// deployment. Nothing new should be built on it.

/**
 * The union **as it may still be found in the database**: the three canonical members plus
 * the legacy `dm` that the GM layer was stored as before it was renamed.
 *
 * Used by `convex/schema.ts` and by nothing else, which is the whole shape of the
 * widen-migrate-narrow: the *stored* union is wide enough to validate a row written before
 * the rename, and every other spelling in the codebase — the public projection,
 * `board.addToken`'s argument validator, `board.setLayer`'s — is already the narrow one.
 * So no `'dm'` can be created from this commit forward and none can leave the server, and
 * the browser never learns that the transition happened.
 */
export const storedTokenLayerValidator = v.union(
  v.literal('background'),
  v.literal('player'),
  v.literal('gm'),
  v.literal('dm'),
)
export type StoredTokenLayer = Infer<typeof storedTokenLayerValidator>

/**
 * A stored layer read as a canonical one. The one place `dm` means `gm`.
 *
 * Every read path calls this before asking either question above, so the legacy value is
 * normalised at the boundary rather than handled in each predicate — which is what keeps
 * the two `never` arms about the three real members and lets the narrow commit delete this
 * function instead of unpicking four switches.
 */
export function layerOf(stored: StoredTokenLayer): TokenLayer {
  return stored === 'dm' ? 'gm' : stored
}
