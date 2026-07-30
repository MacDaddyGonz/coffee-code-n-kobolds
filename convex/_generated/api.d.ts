/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as board from "../board.js";
import type * as characters from "../characters.js";
import type * as files from "../files.js";
import type * as games from "../games.js";
import type * as lib_board from "../lib/board.js";
import type * as lib_characters from "../lib/characters.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_games from "../lib/games.js";
import type * as lib_grid from "../lib/grid.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_players from "../lib/players.js";
import type * as lib_scenes from "../lib/scenes.js";
import type * as players from "../players.js";
import type * as scenes from "../scenes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  board: typeof board;
  characters: typeof characters;
  files: typeof files;
  games: typeof games;
  "lib/board": typeof lib_board;
  "lib/characters": typeof lib_characters;
  "lib/codes": typeof lib_codes;
  "lib/games": typeof lib_games;
  "lib/grid": typeof lib_grid;
  "lib/limits": typeof lib_limits;
  "lib/names": typeof lib_names;
  "lib/players": typeof lib_players;
  "lib/scenes": typeof lib_scenes;
  players: typeof players;
  scenes: typeof scenes;
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
