import { describe, expect, it } from 'vitest'
import { angularSeparationArcminutes, parseHorizonsVectors } from './horizons-validation-lib.mjs'

describe('JPL Horizons validation helpers', () => {
  it('extracts CSV vectors between Horizons markers', () => {
    const result = 'header\n$$SOE\n2461041.5, A.D. 2026-Jan-01, -2.15E-1, -4.09E-1, -1.37E-2,\n$$EOE\nfooter'
    expect(parseHorizonsVectors(result)).toEqual([[-0.215, -0.409, -0.0137]])
  })

  it('measures angular separation in arcminutes', () => {
    expect(angularSeparationArcminutes([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 8)
    expect(angularSeparationArcminutes([1, 0, 0], [0, 1, 0])).toBeCloseTo(5_400, 8)
  })
})
