import { describe, expect, test } from 'vitest'

import {
  MAX_SCALE,
  MIN_SCALE,
  WHEEL_STEP,
  ZOOM_PRESETS,
  clampCamera,
  clampScale,
  fitCamera,
  nextPreset,
  toImageSpace,
  toScreenSpace,
  zoomAbout,
  zoomTo,
} from '@/lib/camera'
import type { Camera } from '@/lib/camera'

/** The four sample maps, at the dimensions they actually are. */
const SAMPLE_MAPS = [
  { name: 'Admittance [Gridded 16x12]', width: 2240, height: 1680 },
  { name: 'Ashen Chasm [Gridded 18x12]', width: 2520, height: 1680 },
  { name: 'farmershall_ground', width: 5040, height: 4620 },
  { name: 'farmershall_1stfloor', width: 5320, height: 7840 },
]

const VIEWPORTS = [
  { width: 1200, height: 800 },
  { width: 1920, height: 1080 },
  { width: 640, height: 480 },
]

/** Enough scales to cover both clamps and the ordinary middle. */
const SCALES = [MIN_SCALE, 0.13, 0.25, 1, 1.5, 2.75, MAX_SCALE]

describe('clampScale', () => {
  test('holds both limits', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE)
    expect(clampScale(99)).toBe(MAX_SCALE)
    expect(clampScale(1.5)).toBe(1.5)
  })

  // A NaN scale survives every comparison silently and then projects the whole
  // board to one point, so it has to be caught here rather than downstream. Both
  // infinities go the same way: there is no sensible clamp for them, and 100% is
  // the one scale a viewer can always make sense of.
  test('turns a non-finite scale back into something usable', () => {
    expect(clampScale(Number.NaN)).toBe(1)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(1)
  })
})

describe('toImageSpace and toScreenSpace', () => {
  test('are exact inverses at every scale', () => {
    for (const scale of SCALES) {
      const camera: Camera = { scale, x: -317.5, y: 84.25 }
      for (const point of [
        { x: 0, y: 0 },
        { x: 640, y: 360 },
        { x: -120.5, y: 1999.75 },
      ]) {
        const roundTripped = toScreenSpace(camera, toImageSpace(camera, point))
        expect(roundTripped.x).toBeCloseTo(point.x, 6)
        expect(roundTripped.y).toBeCloseTo(point.y, 6)

        const back = toImageSpace(camera, toScreenSpace(camera, point))
        expect(back.x).toBeCloseTo(point.x, 6)
        expect(back.y).toBeCloseTo(point.y, 6)
      }
    }
  })

  test('agree with the camera at 100% and the origin', () => {
    const camera: Camera = { scale: 1, x: 0, y: 0 }
    expect(toImageSpace(camera, { x: 42, y: 7 })).toEqual({ x: 42, y: 7 })
  })

  // The bug this whole module exists to prevent: screen coordinates are right at
  // 100% and wrong in proportion to the zoom everywhere else.
  test('differ from raw screen coordinates once zoomed', () => {
    const camera: Camera = { scale: 2, x: -400, y: -200 }
    expect(toImageSpace(camera, { x: 400, y: 200 })).toEqual({ x: 400, y: 200 })
    expect(toImageSpace(camera, { x: 800, y: 600 })).toEqual({ x: 600, y: 400 })
  })
})

describe('zoomAbout', () => {
  test('leaves the image point under the pointer where it was', () => {
    const camera: Camera = { scale: 0.8, x: 130, y: -55 }
    const pointer = { x: 512, y: 377 }
    const before = toImageSpace(camera, pointer)

    for (const factor of [WHEEL_STEP, 1 / WHEEL_STEP, 2, 0.5]) {
      const zoomed = zoomAbout(camera, pointer, factor)
      const after = toScreenSpace(zoomed, before)
      expect(after.x).toBeCloseTo(pointer.x, 6)
      expect(after.y).toBeCloseTo(pointer.y, 6)
    }
  })

  test('holds the fixed point across a whole spin of the wheel', () => {
    const pointer = { x: 300, y: 220 }
    let camera: Camera = fitCamera({ width: 5040, height: 4620 }, { width: 1200, height: 800 })
    const anchor = toImageSpace(camera, pointer)

    for (let notch = 0; notch < 40; notch += 1) {
      camera = zoomAbout(camera, pointer, WHEEL_STEP)
      const projected = toScreenSpace(camera, anchor)
      expect(projected.x).toBeCloseTo(pointer.x, 4)
      expect(projected.y).toBeCloseTo(pointer.y, 4)
    }
    // Forty notches of 10% would be 45×; the ceiling stops it.
    expect(camera.scale).toBe(MAX_SCALE)
  })

  test('is a no-op at the ceiling and the floor', () => {
    const pointer = { x: 100, y: 100 }

    const top = zoomAbout({ scale: MAX_SCALE, x: 10, y: 20 }, pointer, WHEEL_STEP)
    expect(top.scale).toBe(MAX_SCALE)
    expect(top.x).toBeCloseTo(10, 6)
    expect(top.y).toBeCloseTo(20, 6)

    const bottom = zoomAbout({ scale: MIN_SCALE, x: 10, y: 20 }, pointer, 1 / WHEEL_STEP)
    expect(bottom.scale).toBe(MIN_SCALE)
    expect(bottom.x).toBeCloseTo(10, 6)
    expect(bottom.y).toBeCloseTo(20, 6)
  })

  test('still anchors the pointer when the requested scale is clamped', () => {
    const camera: Camera = { scale: 3, x: -900, y: -400 }
    const pointer = { x: 640, y: 400 }
    const anchor = toImageSpace(camera, pointer)
    const zoomed = zoomTo(camera, pointer, 50)
    expect(zoomed.scale).toBe(MAX_SCALE)
    const projected = toScreenSpace(zoomed, anchor)
    expect(projected.x).toBeCloseTo(pointer.x, 6)
    expect(projected.y).toBeCloseTo(pointer.y, 6)
  })
})

describe('nextPreset', () => {
  test('walks the presets from an exact preset', () => {
    expect(nextPreset(1, 1)).toBe(1.5)
    expect(nextPreset(1, -1)).toBe(0.75)
    expect(nextPreset(0.25, 1)).toBe(0.5)
    expect(nextPreset(2, 1)).toBe(MAX_SCALE)
  })

  test('walks outwards from an off-preset scale in both directions', () => {
    expect(nextPreset(0.9, 1)).toBe(1)
    expect(nextPreset(0.9, -1)).toBe(0.75)
    expect(nextPreset(1.21, 1)).toBe(1.5)
    expect(nextPreset(1.21, -1)).toBe(1)
    expect(nextPreset(3.4, 1)).toBe(4)
    expect(nextPreset(3.4, -1)).toBe(2)
    expect(nextPreset(0.3, -1)).toBe(0.25)
  })

  test('stops at the limits rather than wrapping', () => {
    expect(nextPreset(MAX_SCALE, 1)).toBe(MAX_SCALE)
    expect(nextPreset(0.2, -1)).toBe(MIN_SCALE)
    expect(nextPreset(MIN_SCALE, -1)).toBe(MIN_SCALE)
  })

  // A fitted seven-storey hall sits below the lowest preset, and zooming out from
  // there must not quietly zoom in.
  test('never zooms in on a zoom-out request', () => {
    const fitted = fitCamera({ width: 5320, height: 7840 }, { width: 1200, height: 800 })
    expect(fitted.scale).toBeLessThan(MIN_SCALE)
    expect(nextPreset(fitted.scale, -1)).toBeLessThanOrEqual(fitted.scale)
    expect(nextPreset(fitted.scale, 1)).toBe(0.25)
  })

  test('every preset is reachable by stepping up from the bottom', () => {
    const walked: number[] = []
    let scale = MIN_SCALE
    for (let step = 0; step < ZOOM_PRESETS.length; step += 1) {
      scale = nextPreset(scale, 1)
      walked.push(scale)
    }
    expect(walked).toEqual(ZOOM_PRESETS)
  })
})

describe('fitCamera', () => {
  test('fits the whole of every sample map, centred', () => {
    for (const map of SAMPLE_MAPS) {
      for (const viewport of VIEWPORTS) {
        const camera = fitCamera(map, viewport)
        const topLeft = toScreenSpace(camera, { x: 0, y: 0 })
        const bottomRight = toScreenSpace(camera, { x: map.width, y: map.height })

        // Every corner inside the viewport is what "fits" means.
        expect(topLeft.x, `${map.name} left`).toBeGreaterThanOrEqual(0)
        expect(topLeft.y, `${map.name} top`).toBeGreaterThanOrEqual(0)
        expect(bottomRight.x, `${map.name} right`).toBeLessThanOrEqual(viewport.width)
        expect(bottomRight.y, `${map.name} bottom`).toBeLessThanOrEqual(viewport.height)

        // Centred: equal slack on opposite sides.
        expect(topLeft.x).toBeCloseTo(viewport.width - bottomRight.x, 6)
        expect(topLeft.y).toBeCloseTo(viewport.height - bottomRight.y, 6)
      }
    }
  })

  test('leaves the requested margin on the tight axis', () => {
    const camera = fitCamera({ width: 2240, height: 1680 }, { width: 1200, height: 800 }, 24)
    // 800 - 48 over 1680 is the binding ratio here, not the width.
    expect(camera.scale).toBeCloseTo((800 - 48) / 1680, 9)
    expect(camera.y).toBeCloseTo(24, 6)
  })

  test('does not upscale past the zoom ceiling', () => {
    expect(fitCamera({ width: 10, height: 10 }, { width: 1200, height: 800 }).scale).toBe(MAX_SCALE)
  })

  // The first render happens before the board has been measured and before the
  // scene image has loaded, so both of these are ordinary rather than exotic.
  test('survives an unmeasured viewport and a missing image', () => {
    expect(fitCamera({ width: 2240, height: 1680 }, { width: 0, height: 0 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    })
    expect(fitCamera({ width: 0, height: 0 }, { width: 1200, height: 800 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    })
  })
})

describe('clampCamera', () => {
  const map = { width: 2240, height: 1680 }
  const viewport = { width: 1200, height: 800 }

  /** How much of the viewport the map covers, per axis, after clamping. */
  function covered(camera: Camera) {
    const width = map.width * camera.scale
    const height = map.height * camera.scale
    return {
      x: Math.min(viewport.width, camera.x + width) - Math.max(0, camera.x),
      y: Math.min(viewport.height, camera.y + height) - Math.max(0, camera.y),
    }
  }

  test('leaves a camera looking at the map alone', () => {
    const camera: Camera = { scale: 0.4, x: -100, y: -50 }
    expect(clampCamera(camera, map, viewport)).toEqual(camera)
  })

  test('stops the map being flung off any edge', () => {
    for (const camera of [
      { scale: 1, x: 99999, y: 0 },
      { scale: 1, x: -99999, y: 0 },
      { scale: 1, x: 0, y: 99999 },
      { scale: 1, x: 0, y: -99999 },
      { scale: 1, x: 99999, y: -99999 },
      { scale: 0.1, x: -4000, y: -4000 },
    ] satisfies Camera[]) {
      const bounded = clampCamera(camera, map, viewport)
      const cover = covered(bounded)
      // A quarter of each axis, or all of the map when it is smaller than that —
      // at 10% a 2240-px map is 224 px wide and cannot cover 300.
      const needed = {
        x: Math.min(map.width * camera.scale, viewport.width * 0.25),
        y: Math.min(map.height * camera.scale, viewport.height * 0.25),
      }
      expect(cover.x).toBeGreaterThanOrEqual(needed.x - 1e-6)
      expect(cover.y).toBeGreaterThanOrEqual(needed.y - 1e-6)
    }
  })

  test('never touches the scale', () => {
    for (const scale of SCALES) {
      expect(clampCamera({ scale, x: 1e6, y: -1e6 }, map, viewport).scale).toBe(scale)
    }
  })

  test('asks a map smaller than the bound only to stay wholly visible', () => {
    // At 4% of the viewport width the map cannot cover a quarter of it, so the
    // requirement degrades to "all of you, on screen" rather than becoming
    // unsatisfiable.
    const tiny = { width: 50, height: 50 }
    const bounded = clampCamera({ scale: 1, x: 5000, y: -5000 }, tiny, viewport)
    expect(bounded.x).toBe(viewport.width - tiny.width)
    expect(bounded.y).toBe(0)
  })

  test('leaves a degenerate viewport or image alone', () => {
    const camera: Camera = { scale: 1, x: 12, y: 34 }
    expect(clampCamera(camera, map, { width: 0, height: 0 })).toEqual(camera)
    expect(clampCamera(camera, { width: 0, height: 0 }, viewport)).toEqual(camera)
  })

  test('a fitted map is already within bounds', () => {
    for (const sample of SAMPLE_MAPS) {
      for (const size of VIEWPORTS) {
        const fitted = fitCamera(sample, size)
        expect(clampCamera(fitted, sample, size)).toEqual(fitted)
      }
    }
  })
})
