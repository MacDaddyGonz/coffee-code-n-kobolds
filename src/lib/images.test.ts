import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  MAP_MAX_EDGE,
  MAP_QUALITY,
  MAX_SCENE_BYTES,
  TOKEN_MAX_EDGE,
  downscaleImage,
  downscaleMap,
  downscaleToken,
  formatBytes,
  targetSize,
} from './images'

describe('targetSize', () => {
  test('caps the long edge of a landscape map', () => {
    // farmershall_1stfloor.png, the worst of the sample maps at 23 megapixels.
    expect(targetSize(5040, 4620, MAP_MAX_EDGE)).toEqual({ width: 2560, height: 2347 })
  })

  test('caps the long edge of a portrait map', () => {
    // finalenemy_lvl03_nogrid_5320x7840.jpg — the cap has to follow the height.
    expect(targetSize(5320, 7840, MAP_MAX_EDGE)).toEqual({ width: 1737, height: 2560 })
  })

  test('leaves the pre-gridded sample maps completely untouched', () => {
    // This is load-bearing: both are already inside the cap, and resampling them
    // would shift a printed grid off the 140.00 px per square it lands on now.
    const admittance = targetSize(2240, 1680, MAP_MAX_EDGE)
    expect(admittance).toEqual({ width: 2240, height: 1680 })
    expect(admittance.width / 16).toBe(140)
    expect(admittance.height / 12).toBe(140)

    const highSecurity = targetSize(2520, 1680, MAP_MAX_EDGE)
    expect(highSecurity).toEqual({ width: 2520, height: 1680 })
    expect(highSecurity.width / 18).toBe(140)
    expect(highSecurity.height / 12).toBe(140)
  })

  test('an image exactly on the cap is unchanged', () => {
    expect(targetSize(MAP_MAX_EDGE, 1440, MAP_MAX_EDGE)).toEqual({
      width: MAP_MAX_EDGE,
      height: 1440,
    })
  })

  test('shrinks a large token to the token cap', () => {
    expect(targetSize(1200, 1200, TOKEN_MAX_EDGE)).toEqual({ width: 256, height: 256 })
  })

  test('never upscales', () => {
    expect(targetSize(100, 100, TOKEN_MAX_EDGE)).toEqual({ width: 100, height: 100 })
    expect(targetSize(64, 200, TOKEN_MAX_EDGE)).toEqual({ width: 64, height: 200 })
  })

  test('never rounds an edge down to nothing on an extreme aspect ratio', () => {
    expect(targetSize(10000, 3, MAP_MAX_EDGE)).toEqual({ width: 2560, height: 1 })
    expect(targetSize(3, 10000, MAP_MAX_EDGE)).toEqual({ width: 1, height: 2560 })
  })

  test('returns whole pixels', () => {
    const size = targetSize(1999, 1333, 1000)
    expect(Number.isInteger(size.width)).toBe(true)
    expect(Number.isInteger(size.height)).toBe(true)
  })

  test('nonsense dimensions pass straight through rather than becoming NaN sizes', () => {
    expect(targetSize(0, 0, MAP_MAX_EDGE)).toEqual({ width: 0, height: 0 })
    expect(targetSize(Number.NaN, 10, MAP_MAX_EDGE)).toEqual({ width: Number.NaN, height: 10 })
  })
})

describe('formatBytes', () => {
  test('reports the sizes the upload dialog shows the DM', () => {
    // The real before-and-after for farmershall_1stfloor.png.
    expect(formatBytes(21691852)).toBe('20.7 MB')
    expect(formatBytes(1400000)).toBe('1.3 MB')
  })

  test('handles the unit boundaries', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1024 * 1024 - 1)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  test('never displays 1024 KB', () => {
    for (let bytes = 1024 * 1000; bytes < 1024 * 1024 + 2048; bytes += 97) {
      expect(formatBytes(bytes)).not.toContain('1024 KB')
    }
  })

  test('reads the scene limit back as the 4 MB it is written as', () => {
    expect(formatBytes(MAX_SCENE_BYTES)).toBe('4.0 MB')
  })

  test('nothing negative or non-finite escapes', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})

// --- Browser stubs -----------------------------------------------------------
// createImageBitmap and OffscreenCanvas do not exist outside a browser, so these
// stand in for them. They record what they were asked to do, which is the point:
// the assertions worth making about downscaleImage are that the resize went to
// the decode, that the bitmap was released, and that the blob's type is honest.

type BitmapCall = { options: ImageBitmapOptions | undefined }

let bitmapCalls: BitmapCall[] = []
let closedBitmaps = 0
let convertCalls: { type?: string; quality?: number }[] = []
let sourceSize: { width: number; height: number } | null = null
let webp: 'supported' | 'throws' | 'substitutes-png' = 'supported'
let revokedUrls: string[] = []

class FakeImage {
  naturalWidth = 0
  naturalHeight = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  set src(_value: string) {
    queueMicrotask(() => {
      if (sourceSize === null) {
        this.onerror?.()
        return
      }
      this.naturalWidth = sourceSize.width
      this.naturalHeight = sourceSize.height
      this.onload?.()
    })
  }
}

class FakeCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(kind: string) {
    return kind === '2d' ? { drawImage: () => {} } : null
  }

  async convertToBlob(options?: { type?: string; quality?: number }) {
    convertCalls.push({ type: options?.type, quality: options?.quality })
    if (options?.type === 'image/webp') {
      if (webp === 'throws') throw new Error('unsupported type')
      if (webp === 'substitutes-png') return new Blob(['png bytes'], { type: 'image/png' })
      return new Blob(['webp bytes'], { type: 'image/webp' })
    }
    return new Blob(['png bytes'], { type: options?.type ?? 'image/png' })
  }
}

beforeEach(() => {
  bitmapCalls = []
  closedBitmaps = 0
  convertCalls = []
  revokedUrls = []
  sourceSize = { width: 5040, height: 4620 }
  webp = 'supported'

  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:probe',
    revokeObjectURL: (url: string) => revokedUrls.push(url),
  })
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  vi.stubGlobal(
    'createImageBitmap',
    async (_file: Blob, options?: ImageBitmapOptions) => {
      bitmapCalls.push({ options })
      return {
        width: options?.resizeWidth ?? 0,
        height: options?.resizeHeight ?? 0,
        close: () => {
          closedBitmaps++
        },
      }
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function sourceFile(bytes: number) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' })
}

describe('downscaleImage', () => {
  test('passes the target size to the decode rather than scaling afterwards', async () => {
    const result = await downscaleImage(sourceFile(2048), { maxEdge: MAP_MAX_EDGE, quality: 0.5 })

    // 23 megapixels never gets decoded — the decoder is asked for 2560 px direct.
    expect(bitmapCalls).toEqual([
      { options: { resizeWidth: 2560, resizeHeight: 2347, resizeQuality: 'high' } },
    ])
    expect(result.width).toBe(2560)
    expect(result.height).toBe(2347)
  })

  test('reports both sizes so the dialog can show the saving', async () => {
    const file = sourceFile(4096)
    const result = await downscaleImage(file, { maxEdge: MAP_MAX_EDGE, quality: MAP_QUALITY })

    expect(result.originalBytes).toBe(file.size)
    expect(result.bytes).toBe(result.blob.size)
  })

  test('encodes as WebP at the requested quality', async () => {
    const result = await downscaleImage(sourceFile(1024), { maxEdge: MAP_MAX_EDGE, quality: 0.82 })

    expect(convertCalls).toEqual([{ type: 'image/webp', quality: 0.82 }])
    expect(result.blob.type).toBe('image/webp')
  })

  test('falls back to PNG when convertToBlob rejects WebP', async () => {
    webp = 'throws'
    const result = await downscaleImage(sourceFile(1024), { maxEdge: MAP_MAX_EDGE, quality: 0.82 })

    expect(convertCalls.map((call) => call.type)).toEqual(['image/webp', 'image/png'])
    expect(result.blob.type).toBe('image/png')
  })

  test('a canvas that silently substitutes PNG is not passed off as WebP', async () => {
    webp = 'substitutes-png'
    const result = await downscaleImage(sourceFile(1024), { maxEdge: MAP_MAX_EDGE, quality: 0.82 })

    expect(result.blob.type).toBe('image/png')
  })

  test('releases the bitmap, and does so even when encoding fails', async () => {
    await downscaleImage(sourceFile(1024), { maxEdge: MAP_MAX_EDGE, quality: 0.82 })
    expect(closedBitmaps).toBe(1)

    vi.stubGlobal('OffscreenCanvas', class Broken extends FakeCanvas {
      getContext() {
        return null
      }
    })
    await expect(
      downscaleImage(sourceFile(1024), { maxEdge: MAP_MAX_EDGE, quality: 0.82 }),
    ).rejects.toThrow(/cannot prepare images/)
    expect(closedBitmaps).toBe(2)
  })

  test('revokes the probe URL', async () => {
    await downscaleImage(sourceFile(1024), { maxEdge: MAP_MAX_EDGE, quality: 0.82 })
    expect(revokedUrls).toEqual(['blob:probe'])
  })

  test('a file that is not an image is rejected with wording a DM can read', async () => {
    sourceSize = null
    await expect(downscaleMap(sourceFile(16))).rejects.toThrow(
      'That file could not be read as an image.',
    )
    // And the probe URL is still released.
    expect(revokedUrls).toEqual(['blob:probe'])
  })

  test('downscaleMap and downscaleToken apply their own caps', async () => {
    sourceSize = { width: 1200, height: 1200 }

    const map = await downscaleMap(sourceFile(1024))
    expect([map.width, map.height]).toEqual([1200, 1200])

    const token = await downscaleToken(sourceFile(1024))
    expect([token.width, token.height]).toEqual([256, 256])
  })
})
