import { useCallback } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicSheet } from '@convex/lib/characters'
import type { StoredSheet } from '@convex/lib/sheet'
import { errorMessage } from '@/lib/errors'

export type CharacterSheetArgs = {
  code: string
  characterId: Id<'characters'> | null
  /** Routing, not proof of identity — see below. */
  playerId: Id<'players'> | null
  /** Present means this browser holds it; the server re-verifies it every call. */
  dmCode: string | null
}

/**
 * The arguments `characters.sheet` is subscribed with.
 *
 * Built by a function rather than inline for the reason `tokensArgs` gives in
 * useBoard.ts: `undefined` is not a Convex value, so an absent `dmCode` has to be an
 * *omitted* key rather than a present one holding `undefined`. The two spellings are
 * the same request on the wire but not the same object here, and Convex keys a
 * subscription by its arguments — so the sloppy spelling costs a second cache entry
 * for what is the same query.
 *
 * Takes the id non-null, because "no character" is not a set of arguments: the hook
 * skips the query entirely rather than asking about nothing.
 */
export function sheetArgs(args: {
  code: string
  characterId: Id<'characters'>
  playerId: Id<'players'> | null
  dmCode: string | null
}) {
  return {
    code: args.code,
    characterId: args.characterId,
    ...(args.playerId === null ? {} : { playerId: args.playerId }),
    ...(args.dmCode === null ? {} : { dmCode: args.dmCode }),
  }
}

export type CharacterSheetHandle = {
  /**
   * The sheet, or null for every refusal there is — no such character, another
   * seat's hero, any NPC without the DM code. They are one answer on purpose, so
   * this query cannot be used to find out which of them it was; an NPC's *existence*
   * is a spoiler (ADR 0004, and `CHARACTER_NOT_FOUND` in convex/lib/characters.ts).
   *
   * A corollary worth stating because the editor relies on it: `characters.sheet`
   * answers through `requireEditableCharacter`, the same gate `characters.updateSheet`
   * uses. So a sheet that arrived here is one this caller may also change, and there
   * is no read-only mode to build.
   */
  sheet: PublicSheet | null
  loading: boolean
  /**
   * Replaces the whole **stored** sheet, which since Milestone 4 is not the same type
   * as the one that comes back. `PublicSheet.sheet` is *resolved* — a set of library
   * selections already turned into a hero — and what goes the other way is the
   * selections themselves. Only the server can cross that line, because only the server
   * has `lib/library/` (see the note on `publicSheetValidator`).
   *
   * Resolves to the server's own wording, or null.
   */
  save: (next: StoredSheet) => Promise<string | null>
  /** The name lives on the character document, not in the sheet, so it saves apart. */
  rename: (name: string) => Promise<string | null>
  /**
   * Awarding a level, and clearing the lock so a character can be rebuilt. Both are
   * DM-only mutations rather than fields of `save`, so both refuse here without a DM
   * code rather than sending a call that cannot succeed — which is a courtesy and not a
   * check: `requireDm` re-verifies the code server-side on every call regardless.
   */
  setLevel: (level: number) => Promise<string | null>
  setLocked: (locked: boolean) => Promise<string | null>
}

/**
 * One character's sheet, and the two writes that change it.
 *
 * Nothing here authorises anything, and the shape of the arguments is easy to
 * misread as though it did. `playerId` is a routing argument that says which seat is
 * asking, not a proof that the caller is that seat (CLAUDE.md invariant 7), and
 * `dmCode` being in this browser only decides what the interface offers — every
 * mutation re-verifies it server-side on every call. What the panel renders is
 * therefore an affordance, in the same sense `BoardToken.canMove` is one.
 *
 * Current hit points are deliberately not here. They come from `useVitals`, so that
 * a point of damage does not re-push a whole spell list to everyone with the panel
 * open and the board can draw a health bar without ever reading a sheet.
 */
export function useCharacterSheet(args: CharacterSheetArgs): CharacterSheetHandle {
  const { code, characterId, playerId, dmCode } = args

  const result = useQuery(
    api.characters.sheet,
    characterId === null ? 'skip' : sheetArgs({ code, characterId, playerId, dmCode }),
  )

  const updateSheet = useMutation(api.characters.updateSheet)
  const renameCharacter = useMutation(api.characters.rename)
  const setCharacterLevel = useMutation(api.characters.setLevel)
  const setCharacterUnlocked = useMutation(api.characters.setUnlocked)

  const seat = playerId === null ? {} : { playerId }
  const dm = dmCode === null ? {} : { dmCode }

  const save = useCallback(
    async (next: StoredSheet) => {
      if (characterId === null) return 'There is no character to save.'
      try {
        await updateSheet({ code, characterId, sheet: next, ...seat, ...dm })
        return null
      } catch (thrown) {
        // The server's own wording, which for a sheet is the *same string* the form
        // already used to disable Save — one `sheetProblem`, called on both sides.
        return errorMessage(thrown, 'Could not save that character sheet.')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seat and dm are fresh
    // objects each render but their contents are the two primitives listed here.
    [updateSheet, code, characterId, playerId, dmCode],
  )

  const rename = useCallback(
    async (name: string) => {
      if (characterId === null) return 'There is no character to rename.'
      try {
        await renameCharacter({ code, characterId, name, ...dm })
        return null
      } catch (thrown) {
        return errorMessage(thrown, 'Could not rename that character.')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above.
    [renameCharacter, code, characterId, dmCode],
  )

  const setLevel = useCallback(
    async (level: number) => {
      if (characterId === null) return 'There is no character to level up.'
      if (dmCode === null) return 'Only the DM can change a character’s level.'
      try {
        await setCharacterLevel({ code, dmCode, characterId, level })
        return null
      } catch (thrown) {
        return errorMessage(thrown, 'Could not change that level.')
      }
    },
    [setCharacterLevel, code, characterId, dmCode],
  )

  const setLocked = useCallback(
    async (locked: boolean) => {
      if (characterId === null) return 'There is no character to unlock.'
      if (dmCode === null) return 'Only the DM can unlock a character.'
      try {
        await setCharacterUnlocked({ code, dmCode, characterId, locked })
        return null
      } catch (thrown) {
        return errorMessage(thrown, 'Could not unlock that character.')
      }
    },
    [setCharacterUnlocked, code, characterId, dmCode],
  )

  return {
    sheet: result ?? null,
    // A skipped query and a pending one both read as `undefined`, so the id decides:
    // with no character there is nothing being waited for.
    loading: characterId !== null && result === undefined,
    save,
    rename,
    setLevel,
    setLocked,
  }
}
