/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as bestiary from "../bestiary.js";
import type * as board from "../board.js";
import type * as characters from "../characters.js";
import type * as feed from "../feed.js";
import type * as files from "../files.js";
import type * as fog from "../fog.js";
import type * as games from "../games.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_bestiary_benchmarks from "../lib/bestiary/benchmarks.js";
import type * as lib_bestiary_enemies from "../lib/bestiary/enemies.js";
import type * as lib_bestiary_index from "../lib/bestiary/index.js";
import type * as lib_bestiary_monstersHigh from "../lib/bestiary/monstersHigh.js";
import type * as lib_bestiary_monstersLow from "../lib/bestiary/monstersLow.js";
import type * as lib_bestiary_monstersMid from "../lib/bestiary/monstersMid.js";
import type * as lib_bestiary_scale from "../lib/bestiary/scale.js";
import type * as lib_bestiary_social from "../lib/bestiary/social.js";
import type * as lib_bestiary_types from "../lib/bestiary/types.js";
import type * as lib_board from "../lib/board.js";
import type * as lib_characters from "../lib/characters.js";
import type * as lib_classes from "../lib/classes.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_creatures from "../lib/creatures.js";
import type * as lib_dice from "../lib/dice.js";
import type * as lib_feed from "../lib/feed.js";
import type * as lib_fog from "../lib/fog.js";
import type * as lib_games from "../lib/games.js";
import type * as lib_grid from "../lib/grid.js";
import type * as lib_layers from "../lib/layers.js";
import type * as lib_library_barbarian from "../lib/library/barbarian.js";
import type * as lib_library_bard from "../lib/library/bard.js";
import type * as lib_library_cleric from "../lib/library/cleric.js";
import type * as lib_library_fighter from "../lib/library/fighter.js";
import type * as lib_library_index from "../lib/library/index.js";
import type * as lib_library_paladin from "../lib/library/paladin.js";
import type * as lib_library_ranger from "../lib/library/ranger.js";
import type * as lib_library_rogue from "../lib/library/rogue.js";
import type * as lib_library_types from "../lib/library/types.js";
import type * as lib_library_wizard from "../lib/library/wizard.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_modalImages from "../lib/modalImages.js";
import type * as lib_music from "../lib/music.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_players from "../lib/players.js";
import type * as lib_races from "../lib/races.js";
import type * as lib_resolve from "../lib/resolve.js";
import type * as lib_roll from "../lib/roll.js";
import type * as lib_rules from "../lib/rules.js";
import type * as lib_scenes from "../lib/scenes.js";
import type * as lib_sheet from "../lib/sheet.js";
import type * as lib_skills from "../lib/skills.js";
import type * as modalImages from "../modalImages.js";
import type * as music from "../music.js";
import type * as players from "../players.js";
import type * as scenes from "../scenes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  bestiary: typeof bestiary;
  board: typeof board;
  characters: typeof characters;
  feed: typeof feed;
  files: typeof files;
  fog: typeof fog;
  games: typeof games;
  "lib/access": typeof lib_access;
  "lib/bestiary/benchmarks": typeof lib_bestiary_benchmarks;
  "lib/bestiary/enemies": typeof lib_bestiary_enemies;
  "lib/bestiary/index": typeof lib_bestiary_index;
  "lib/bestiary/monstersHigh": typeof lib_bestiary_monstersHigh;
  "lib/bestiary/monstersLow": typeof lib_bestiary_monstersLow;
  "lib/bestiary/monstersMid": typeof lib_bestiary_monstersMid;
  "lib/bestiary/scale": typeof lib_bestiary_scale;
  "lib/bestiary/social": typeof lib_bestiary_social;
  "lib/bestiary/types": typeof lib_bestiary_types;
  "lib/board": typeof lib_board;
  "lib/characters": typeof lib_characters;
  "lib/classes": typeof lib_classes;
  "lib/codes": typeof lib_codes;
  "lib/creatures": typeof lib_creatures;
  "lib/dice": typeof lib_dice;
  "lib/feed": typeof lib_feed;
  "lib/fog": typeof lib_fog;
  "lib/games": typeof lib_games;
  "lib/grid": typeof lib_grid;
  "lib/layers": typeof lib_layers;
  "lib/library/barbarian": typeof lib_library_barbarian;
  "lib/library/bard": typeof lib_library_bard;
  "lib/library/cleric": typeof lib_library_cleric;
  "lib/library/fighter": typeof lib_library_fighter;
  "lib/library/index": typeof lib_library_index;
  "lib/library/paladin": typeof lib_library_paladin;
  "lib/library/ranger": typeof lib_library_ranger;
  "lib/library/rogue": typeof lib_library_rogue;
  "lib/library/types": typeof lib_library_types;
  "lib/library/wizard": typeof lib_library_wizard;
  "lib/limits": typeof lib_limits;
  "lib/modalImages": typeof lib_modalImages;
  "lib/music": typeof lib_music;
  "lib/names": typeof lib_names;
  "lib/players": typeof lib_players;
  "lib/races": typeof lib_races;
  "lib/resolve": typeof lib_resolve;
  "lib/roll": typeof lib_roll;
  "lib/rules": typeof lib_rules;
  "lib/scenes": typeof lib_scenes;
  "lib/sheet": typeof lib_sheet;
  "lib/skills": typeof lib_skills;
  modalImages: typeof modalImages;
  music: typeof music;
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
