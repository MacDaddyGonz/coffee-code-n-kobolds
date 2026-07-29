/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as characters from "../characters.js";
import type * as games from "../games.js";
import type * as lib_characters from "../lib/characters.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_games from "../lib/games.js";
import type * as lib_players from "../lib/players.js";
import type * as players from "../players.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  characters: typeof characters;
  games: typeof games;
  "lib/characters": typeof lib_characters;
  "lib/codes": typeof lib_codes;
  "lib/games": typeof lib_games;
  "lib/players": typeof lib_players;
  players: typeof players;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
