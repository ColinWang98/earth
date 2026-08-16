import { describe, expect, it } from 'vitest'
import { percentile95 } from './performance'

describe('frame timing', () => {
  it('calculates the nearest-rank p95 frame time', () => {
    expect(percentile95(Array.from({ length: 100 }, (_, index) => index + 1))).toBe(95)
    expect(percentile95([])).toBeNull()
  })
})
