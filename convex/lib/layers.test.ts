import { describe, expect, test } from 'vitest'

import {
  TOKEN_LAYERS,
  TOKEN_LAYER_LABELS,
  maySeeLayer,
  mayPlayersMove,
  tokenLayerValidator,
  type TokenLayer,
} from './layers'

/**
 * THE PIN THE COMPILER CANNOT PROVIDE.
 *
 * Every other guard on this union is a compile error: `maySeeLayer` and `mayPlayersMove`
 * each have a `never` arm, `TOKEN_LAYER_LABELS` is a `Record<TokenLayer, string>`, and the
 * client keeps two more records for drawing and labelling a layer. Add a member to
 * `TOKEN_LAYERS` and `npm run lint` names all five.
 *
 * ⚠️ **None of them fires in the other direction, which is the dangerous one.** A literal
 * added to `tokenLayerValidator` alone is a value the schema will accept and store, that
 * `board.addToken` will take as an argument, and that nothing can filter, label or draw —
 * because `TokenLayer` is derived from the array and every guard is keyed off the type.
 * `maySeeLayer` would meet it at runtime and fall to its `never` arm, so the coin would
 * silently vanish from every screen including the DM's.
 *
 * That is `isMonsterSheet`'s history repeating in the one direction it still can, which is
 * why the validator is hand-spelled rather than generated from the array: a generated one
 * would make the two agree by construction and delete the only check that can fail.
 */
describe('the layer union is spelled twice and the two spellings agree', () => {
  /** The literals a `v.union` of `v.literal`s was built from, in declaration order. */
  function literalsOf(union: typeof tokenLayerValidator) {
    return union.members.map((member) => member.value)
  }

  test('the validator has exactly the members of TOKEN_LAYERS, in order', () => {
    // Order and not just membership, because `TOKEN_LAYERS` is bottom-to-top paint order on
    // the Konva side — the array *is* the layering — so a reordering is a rendering bug that
    // set equality would wave through.
    //
    // This is also the assertion that the `dm` → `gm` rename finished. The schema takes this
    // same validator, so a fourth member here is a member the database would store, and the
    // widened `storedTokenLayerValidator` that used to sit beside it is gone.
    expect(literalsOf(tokenLayerValidator)).toEqual([...TOKEN_LAYERS])
  })

  test('every layer has a label, and no label names a layer that does not exist', () => {
    // The forward direction is the compiler's. This is the reverse: a `Record` is satisfied
    // by extra keys, so a label left behind after a member was *removed* is invisible to
    // `tsc` and would sit in the DM's picker forever.
    expect(Object.keys(TOKEN_LAYER_LABELS).sort()).toEqual([...TOKEN_LAYERS].sort())
  })
})

describe('what each layer means', () => {
  /**
   * Written out one row per layer rather than looped, deliberately. This table is the
   * security rule in the most readable form it has anywhere, and a loop over
   * `TOKEN_LAYERS` asserting "whatever the function says" would pass for any
   * implementation at all — including the two-way test this milestone replaced.
   *
   * Neither predicate takes an `isDm`, and the first draft of `maySeeLayer` did. This test
   * is what found it: a parameter the body ignored made `maySeeLayer('gm', true)` read as
   * *may the DM see the GM layer?* and answer `false`, because the DM had already been
   * short-circuited a level up in `maySee`. The signature was a lie rather than the logic
   * being wrong, which is the kind of bug that survives review and then gets called
   * correctly by the next person.
   */
  const SIGHT: Array<[TokenLayer, boolean]> = [
    ['background', true],
    ['player', true],
    ['gm', false],
  ]

  test.each(SIGHT)('%s: a player may be sent it — %s', (layer, visible) => {
    expect(maySeeLayer(layer)).toBe(visible)
  })

  /**
   * ⚠️ **The whole reason a third layer was not a widening.** Sight and interaction agreed
   * on every row of the two-member union — a player-layer token was seen and movable, a
   * DM-layer token neither — so one predicate served both and nobody had to notice it was
   * two questions. Background is the row where they disagree.
   *
   * If this test and the one above ever return the same column for every layer again, the
   * second predicate has stopped earning its existence and somebody will merge them.
   */
  const MOVEMENT: Array<[TokenLayer, boolean]> = [
    ['background', false],
    ['player', true],
    ['gm', false],
  ]

  test.each(MOVEMENT)('%s: a player may move it — %s', (layer, movable) => {
    expect(mayPlayersMove(layer)).toBe(movable)
  })

  test('sight and interaction genuinely differ, which is what a second predicate is for', () => {
    const differing = TOKEN_LAYERS.filter(
      (layer) => maySeeLayer(layer) !== mayPlayersMove(layer),
    )
    expect(differing).toEqual(['background'])
  })
})

describe('unknown layers fail closed', () => {
  /**
   * The runtime half of the `never` arms, and it is not belt-and-braces.
   *
   * A schema push is not atomic across a deployment: a document written by a newer
   * deployment can be read by an older one for the seconds in between, and in that window
   * these functions are handed a layer they have never heard of. The union is ordered
   * bottom to top with the secret at the top, so an unrecognised member is presumptively
   * *more* hidden. Getting it wrong this way costs a coin missing from the board for a few
   * seconds; getting it wrong the other way spoils an ambush.
   *
   * Cast because the point is a value the type system says cannot exist — which is exactly
   * the case the arm is for.
   */
  const IMPOSSIBLE = 'wards' as TokenLayer

  test('a layer from the future is withheld from a player', () => {
    expect(maySeeLayer(IMPOSSIBLE)).toBe(false)
  })

  test('and cannot be moved by one either', () => {
    expect(mayPlayersMove(IMPOSSIBLE)).toBe(false)
  })

  test('the fail-closed direction is the one that keeps the returns: validator quiet', () => {
    // Ordering, not redundancy. Because the row is *dropped*, an unknown layer never reaches
    // `publicTokenValidator` — so Convex does not throw and take the whole table's board
    // query down with it. Fail-open here would turn a stale read into an outage.
    expect(maySeeLayer(IMPOSSIBLE)).toBe(false)
  })
})

describe('the legacy spelling is gone', () => {
  /**
   * The narrow half of widen–migrate–narrow, asserted rather than assumed.
   *
   * `dm` was the GM layer's stored value before it was renamed, carried across two deploys
   * by a widened `storedTokenLayerValidator` and a `layerOf` normaliser. Both are deleted:
   * the sweep ran against every deployment and `admin:gamesWithLegacyLayers` read zero.
   *
   * ⚠️ **What makes this safe is Convex rather than this test.** A push that narrows a union
   * while a row still holds the old value is refused, so the schema being narrow is proof no
   * such row survives. This asserts the *code* finished the job — that the old spelling is
   * not still being accepted somewhere out of habit — which is the half Convex cannot see.
   */
  test('dm is not a layer, and both predicates treat it as unknown', () => {
    expect([...TOKEN_LAYERS]).not.toContain('dm')

    const legacy = 'dm' as TokenLayer
    expect(maySeeLayer(legacy)).toBe(false)
    expect(mayPlayersMove(legacy)).toBe(false)
  })
})
