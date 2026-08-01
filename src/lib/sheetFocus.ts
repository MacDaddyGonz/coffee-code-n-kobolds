import type { Id } from '@convex/_generated/dataModel'

/**
 * Whose sheet the right-hand panel is showing, and why there is one at all.
 *
 * `tokenWithoutSheet` is a real answer rather than a variety of `none`: a token
 * with nothing behind it — a scenery marker, a summoned wolf nobody wrote a sheet
 * for — is something the DM has deliberately clicked on, and the panel saying
 * *this token carries no sheet* is the difference between an empty panel that
 * explains itself and one that looks broken.
 */
export type SheetFocus =
  | { kind: 'character'; characterId: Id<'characters'> }
  | { kind: 'tokenWithoutSheet'; tokenId: Id<'tokens'> }
  | { kind: 'none' }

/**
 * Which creature the sheet panel is talking about. One function, five rules, and
 * **the only place the question is asked.**
 *
 * It is a function rather than three expressions at three call sites because the
 * readers are already more than one — the player's Character tab and the DM's
 * Sheets tab resolve it identically — and the roll announcement the next milestone
 * brings is the fourth. Three call sites agreeing today is three call sites that
 * disagree the first time one of them learns a new rule.
 *
 * The order below is the whole of the behaviour:
 *
 * 1. **A direct pick from the DM's selector wins.** It has to beat a token, because
 *    a creature routinely has no token at all — the bestiary shelf creates a
 *    creature and never places one — so a stale token id from an earlier click must
 *    not be what decides. This is the rule that stops choosing an unplaced monster
 *    leaving the *previous* monster on screen.
 * 2. **Then whatever the selected token is bound to.** Clicking a coin on the map is
 *    the other way of saying "this one".
 * 3. **Then, for a player only, their own character.** Deselecting is how a player
 *    gets back to their own sheet, and there is deliberately no history and no third
 *    state: one gesture, one destination, always the same one.
 * 4. **Then, for the DM only, the token itself.**
 * 5. **Then nothing.**
 *
 * ⚠️ **Rules 3 and 4 are asymmetric on purpose.** A player falls back to their own
 * character and the DM does not, because the DM does not play one — a DM who
 * deselects has finished with that creature and should land on nothing, not on a
 * character they happen to have picked up. That asymmetry is the reason `isDm` is
 * an argument here at all; nothing else in this function is a permission, and
 * nothing in it decides what may be *sent* to anybody. Secrecy was settled
 * server-side long before any of these ids arrived (CLAUDE.md invariant 1) — this
 * only chooses which of the sheets this browser already holds is on screen.
 */
export function sheetFocusOf(args: {
  /** The DM selector's direct pick, which may name a creature with no token. */
  selectedCharacterId: Id<'characters'> | null
  selectedTokenId: Id<'tokens'> | null
  /** What that token is bound to, looked up from the live board by the caller. */
  selectedTokenCharacterId: Id<'characters'> | null
  /** The character this seat is playing, or null. */
  myCharacterId: Id<'characters'> | null
  isDm: boolean
}): SheetFocus {
  const {
    selectedCharacterId,
    selectedTokenId,
    selectedTokenCharacterId,
    myCharacterId,
    isDm,
  } = args

  if (selectedCharacterId !== null) return { kind: 'character', characterId: selectedCharacterId }

  if (selectedTokenCharacterId !== null) {
    return { kind: 'character', characterId: selectedTokenCharacterId }
  }

  if (!isDm && myCharacterId !== null) return { kind: 'character', characterId: myCharacterId }

  if (isDm && selectedTokenId !== null) {
    return { kind: 'tokenWithoutSheet', tokenId: selectedTokenId }
  }

  return { kind: 'none' }
}
