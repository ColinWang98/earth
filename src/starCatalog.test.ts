import { describe, expect, it } from 'vitest'
import { decodeGaiaCatalog, propagatedPosition } from './starCatalog'

function oneStarBuffer() {
  const buffer = new ArrayBuffer(64)
  const view = new DataView(buffer)
  view.setUint32(0, 0x31494147, true)
  view.setUint16(4, 1, true)
  view.setUint16(6, 48, true)
  view.setUint32(8, 1, true)
  view.setUint32(16, 1, true)
  view.setUint32(20, 2, true)
  ;[1, 2, 3].forEach((value, index) => view.setFloat32(24 + index * 4, value, true))
  ;[0.1, 0.2, 0.3].forEach((value, index) => view.setFloat32(36 + index * 4, value, true))
  view.setFloat32(48, 4, true)
  view.setFloat32(52, 0.5, true)
  view.setUint32(56, 1, true)
  view.setUint32(60, 9, true)
  return buffer
}

describe('Gaia runtime decoder', () => {
  it('decodes the binary catalogue into GPU-friendly arrays', () => {
    const catalog = decodeGaiaCatalog(oneStarBuffer())

    expect(catalog.count).toBe(1)
    expect(Array.from(catalog.positions)).toEqual([1, 2, 3])
    expect(Array.from(catalog.velocities)).toEqual(expect.arrayContaining([expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.3)]))
    expect(catalog.sourceIds[0]).toBe('4294967298')
    expect(catalog.qualityFlags[0]).toBe(1)
  })

  it('propagates a Cartesian position from the Gaia 2016 epoch', () => {
    expect(propagatedPosition([1, 2, 3], [0.1, 0.2, 0.3], 2026)).toEqual([2, 4, 6])
  })
})
