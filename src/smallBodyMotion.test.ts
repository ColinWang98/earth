import { describe, expect, it } from 'vitest'
import { frameSimulationUtcMs, poleDirectionThree, spinAngleRad } from './smallBodyMotion'

describe('continuous small-body render time', () => {
  it('interpolates forward and reverse playback between React clock samples', () => {
    const utcMs = Date.UTC(2026, 0, 1)
    expect(frameSimulationUtcMs(utcMs, 1_000, 1_100, 2_592_000, false)).toBe(utcMs + 3 * 86_400_000)
    expect(frameSimulationUtcMs(utcMs, 1_000, 1_100, -86_400, false)).toBe(utcMs - 8_640_000)
  })

  it('freezes interpolated time while paused', () => {
    const utcMs = Date.UTC(2026, 0, 1)
    expect(frameSimulationUtcMs(utcMs, 1_000, 9_000, 2_592_000, true)).toBe(utcMs)
  })
})

describe('small-body spin orientation', () => {
  it('returns a normalized Three.js pole direction', () => {
    const direction = poleDirectionThree(291.421, 66.758)
    expect(Math.hypot(...direction)).toBeCloseTo(1, 10)
    expect(direction.every(Number.isFinite)).toBe(true)
  })

  it('advances half a rotation over half a period', () => {
    const epoch = Date.UTC(2000, 0, 1, 12)
    const periodHours = 9.07417
    expect(spinAngleRad(epoch, periodHours)).toBeCloseTo(0, 10)
    expect(spinAngleRad(epoch + periodHours * 1_800_000, periodHours)).toBeCloseTo(Math.PI, 10)
  })
})
