import { describe, expect, test } from 'vitest'

import type { BoardTool } from './boardTool'
import {
  BOARD_TOOLS,
  BOARD_TOOL_SURFACE,
  FOG_TOOLS,
  WALL_TOOLS,
  armBoardTool,
  boardSurface,
  boardTool,
  isFogTool,
  isWallTool,
  putDownBoardSurface,
  subscribeToBoardTool,
} from './boardTool'

/**
 * ⚠️ **The cell is module-level and keyed by game code, so every test below invents its own
 * code rather than resetting the store.** A `resetBoardTools` export would exist only for this
 * file, and a test-only door into a shared cell is the sort of thing that ends up called from
 * a component. Distinct keys cost nothing and there is nothing to forget to call.
 */
let next = 0
function code(): string {
  next += 1
  return `TEST${next}`
}

describe('one armed tool, by construction', () => {
  /**
   * ⭐ **The assertion the whole merge exists for.** Three separate cells could each say *my
   * tool is out*, and all three could say it at once — so three draw surfaces spanning the
   * whole image were mounted, the last one took every press, and two panels went on showing a
   * lit button for a tool that had silently stopped working. One cell holding one value makes
   * this true without three effects agreeing to it.
   */
  test('arming one tool puts down whatever was held', () => {
    const game = code()
    expect(boardTool(game)).toBe('off')

    for (const tool of BOARD_TOOLS) {
      armBoardTool(game, tool)
      expect(boardTool(game)).toBe(tool)
      for (const other of BOARD_TOOLS) {
        if (other !== tool) expect(boardTool(game)).not.toBe(other)
      }
    }
  })

  test('a browser that has been in two games carries nothing between them', () => {
    const first = code()
    const second = code()

    armBoardTool(first, 'fog-erase')
    expect(boardTool(second)).toBe('off')
    armBoardTool(second, 'wall-draw')
    expect(boardTool(first)).toBe('fog-erase')
  })

  test('subscribers hear about a change and not about a no-op', () => {
    const game = code()
    let heard = 0
    const stop = subscribeToBoardTool(game, () => {
      heard += 1
    })

    armBoardTool(game, 'grid')
    expect(heard).toBe(1)
    // Pressing the tool already in your hand would otherwise repaint the board, because
    // `useSyncExternalStore` re-renders every subscriber on any notification.
    armBoardTool(game, 'grid')
    expect(heard).toBe(1)
    armBoardTool(game, 'off')
    expect(heard).toBe(2)

    stop()
    armBoardTool(game, 'fog-draw')
    expect(heard).toBe(2)
  })
})

describe('putting a tool down', () => {
  /**
   * ⚠️ **The conditional is what the merge made necessary**, and it is the one behaviour that
   * would have been quietly lost. Each panel disarms itself on unmount, because
   * `DmToolsTab`'s sub-tab strip is uncontrolled and its subtree is not force-mounted. With
   * three cells an unconditional put-down was correct; with one it would let the Fog panel
   * disarm the grid tracer on its way off screen.
   */
  test('a panel only puts down its own surface', () => {
    const game = code()

    armBoardTool(game, 'grid')
    putDownBoardSurface(game, 'fog')
    expect(boardTool(game)).toBe('grid')
    putDownBoardSurface(game, 'wall')
    expect(boardTool(game)).toBe('grid')
    putDownBoardSurface(game, 'grid')
    expect(boardTool(game)).toBe('off')
  })

  test('putting down an already-off board is a no-op rather than a notification', () => {
    const game = code()
    let heard = 0
    subscribeToBoardTool(game, () => {
      heard += 1
    })

    putDownBoardSurface(game, 'fog')
    expect(boardTool(game)).toBe('off')
    expect(heard).toBe(0)
  })
})

/**
 * ⚠️ **The direction the compiler cannot see, which is `lib/layers.test.ts`' job for
 * `TOKEN_LAYERS` and is this file's for `BoardTool`.**
 *
 * The compiler already refuses a `Record<BoardTool, …>` that is missing a member, so
 * `BOARD_TOOL_SURFACE` cannot fall behind the union. What it cannot see is the *array* and the
 * two hand-spelled subsets: a member added to the union and to the surface map but not to
 * `FOG_TOOLS` is a fog mode that compiles, arms, mounts a surface — and has no button anywhere
 * to arm it with. So the agreements are swept both ways round.
 */
describe('the vocabulary and the Records over it agree', () => {
  test('every member of the union has a surface, and the surface map has no extras', () => {
    const keys = Object.keys(BOARD_TOOL_SURFACE) as BoardTool[]
    expect([...keys].sort()).toEqual([...BOARD_TOOLS].sort())
  })

  test('BOARD_TOOLS holds every member exactly once', () => {
    expect(new Set(BOARD_TOOLS).size).toBe(BOARD_TOOLS.length)
  })

  test('only `off` has no surface, and every other tool takes the pointer', () => {
    for (const tool of BOARD_TOOLS) {
      const surface = BOARD_TOOL_SURFACE[tool]
      if (tool === 'off') expect(surface).toBe('none')
      else expect(surface).not.toBe('none')
    }
  })

  /**
   * Both ways round, because the two failures are different. A fog tool missing from
   * `FOG_TOOLS` has no button; a tool in `FOG_TOOLS` whose surface is not `fog` is a button in
   * the fog panel that arms somebody else's overlay.
   */
  test('the fog panel offers exactly the fog tools, plus off', () => {
    for (const tool of FOG_TOOLS) {
      if (tool === 'off') continue
      expect(BOARD_TOOL_SURFACE[tool], `${tool} is offered by the fog panel`).toBe('fog')
    }
    for (const tool of BOARD_TOOLS) {
      if (BOARD_TOOL_SURFACE[tool] !== 'fog') continue
      expect(FOG_TOOLS, `${tool} has no button in the fog panel`).toContain(tool)
    }
    expect(FOG_TOOLS[0]).toBe('off')
  })

  test('the wall panel offers exactly the wall tools, plus off', () => {
    for (const tool of WALL_TOOLS) {
      if (tool === 'off') continue
      expect(BOARD_TOOL_SURFACE[tool], `${tool} is offered by the wall panel`).toBe('wall')
    }
    for (const tool of BOARD_TOOLS) {
      if (BOARD_TOOL_SURFACE[tool] !== 'wall') continue
      expect(WALL_TOOLS, `${tool} has no button in the wall panel`).toContain(tool)
    }
    expect(WALL_TOOLS[0]).toBe('off')
  })

  /**
   * A panel whose tool is not the armed one reads `off`, which is what lets each of them index
   * a `Record` over its own subset without a fallback written at every call site.
   */
  test('the two guards recognise their own members and nobody else’s', () => {
    for (const tool of BOARD_TOOLS) {
      expect(isFogTool(tool)).toBe(FOG_TOOLS.includes(tool as never))
      expect(isWallTool(tool)).toBe(WALL_TOOLS.includes(tool as never))
    }
  })

  test('boardSurface reads the armed tool through the same map', () => {
    const game = code()
    for (const tool of BOARD_TOOLS) {
      armBoardTool(game, tool)
      expect(boardSurface(game)).toBe(BOARD_TOOL_SURFACE[tool])
    }
  })
})
