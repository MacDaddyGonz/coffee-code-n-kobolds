import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

/**
 * ONE LINE OF THE FEED, taken from the query's own return type.
 *
 * ⚠️ **Not imported from where it is declared, and that is forced rather than tidy.** The
 * validator this is inferred from lives beside the choke point over the `feed` table, and
 * `bundleGuard.test.ts` fails the build on **any** quoted specifier naming that module from
 * under `src/` — including an `import type`, which the guard lists among the spellings it
 * must catch. That is the right call on its part: a bundler follows a type-only specifier
 * for side effects unless everything about it is erasable, and the module on the other end
 * takes a pre-filtered set of character ids that only a Convex function can have built.
 *
 * `FunctionReturnType` is the established way out — `BestiaryPicker` reads its index row
 * the same way, and for the same class of reason — and it is strictly better than the
 * alternative of restating the shape here: a hand-written copy compiles happily after the
 * server payload grows a field, and this does not. The generated API is the one route from
 * the browser into `convex/` that carries a payload's shape without carrying its code.
 *
 * Named for the validator it comes from so that a reader who greps for the server's name
 * finds this, which is the only thing the indirection costs.
 */
export type PublicFeedRow = FunctionReturnType<typeof api.feed.list>[number]

/**
 * The arguments `feed.list` is subscribed with.
 *
 * ⚠️ **Exported and mandatory, not stylistic.** `useQuery` memoises on
 * `JSON.stringify(convexToJson(args))`, so `{ code, dmCode: undefined }` beside `{ code }`
 * is a *second* cache entry — a second socket subscription and a second server-side
 * execution of a query that reads sixty rows and every character in the game. The feed now
 * has two readers on one screen, the panel and the table effects, and they have to name the
 * same entry or the dice tumble for a row the panel has not been told about yet. `tokensArgs`
 * and `vitalsArgs` exist for the identical reason and this is the third of the set.
 *
 * **`vitalsArgs`' shape, term for term, because `feed.list` composes the same four calls as
 * `characters.vitals` and its docblock says so.** Both optional arguments are **omitted
 * rather than passed as `undefined`** when absent, because `undefined` is not a Convex
 * value: the two spellings are the same request on the wire and not necessarily the same
 * object here. The key order is fixed by this one builder, which is the other half of why it
 * exists — `JSON.stringify` is order-sensitive.
 *
 * ⚠️ **For a player, `playerId` is part of the key, and leaving it off is a different
 * answer rather than a saving.** A creature the DM has granted this seat is one whose lines
 * this seat may read (ADR 0009), and `readableCharacterIds` cannot know which seat is asking
 * unless it is told — so a subscription built without the id is missing the party pet's
 * rolls. The id authorises nothing (invariant 7); the server re-derives the grant from the
 * token table either way.
 *
 * ⚠️ **For the DM it is dropped, and that is a correctness fix rather than a saving.**
 * `boardCharacterAccess` puts the whole control question behind `!isDm` — `control` is
 * `null` for a caller holding the DM code — so a DM's answer is byte-identical whichever
 * seat is named, and naming one only mints a second entry holding the same rows.
 */
export function feedArgs(code: string, dmCode: string | null, playerId: Id<'players'> | null) {
  if (dmCode !== null) return { code, dmCode }
  return playerId === null ? { code } : { code, playerId }
}

/**
 * Every line this browser may be told about, **oldest first**.
 *
 * The order is the server's decision and not this hook's: `visibleFeed` takes the newest
 * sixty off a descending index and reverses them there, so a chat panel renders the array
 * as it arrives and no component has to remember to flip one it was handed.
 *
 * `undefined` while the first answer is in flight, which every consumer has to draw — the
 * list draws skeletons for it and an empty array gets a sentence instead, because the two
 * mean different things and a skeleton promises something is coming.
 *
 * **Nothing here filters.** Rows arrive from the feed choke point already dropped to what
 * this caller may hear about, by one predicate on the server, and a renderer that had to
 * decide would already have been sent the secret (CLAUDE.md invariant 1).
 */
export function useFeed(
  code: string,
  dmCode: string | null,
  playerId: Id<'players'>,
): PublicFeedRow[] | undefined {
  return useQuery(api.feed.list, feedArgs(code, dmCode, playerId))
}
