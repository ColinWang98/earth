import { describe, expect, it } from 'vitest'
import {
  MAX_SIMULATION_TIME,
  MIN_SIMULATION_TIME,
  advanceSimulationTime,
  clampSimulationTime,
  getEarthFixedSunDirection,
  getSolarSystemSnapshot,
} from './astro'

describe('simulation time', () => {
  it('clamps dates to the supported 1900-2100 range', () => {
    expect(clampSimulationTime(Date.UTC(1800, 0, 1))).toBe(MIN_SIMULATION_TIME)
    expect(clampSimulationTime(Date.UTC(2200, 0, 1))).toBe(MAX_SIMULATION_TIME)
  })

  it('advances by frame delta and playback rate', () => {
    const start = Date.UTC(2026, 0, 1)
    expect(advanceSimulationTime(start, 0.5, 86_400)).toBe(start + 43_200_000)
  })
})

describe('earth lighting', () => {
  it('returns a normalized sun direction that follows earth rotation', () => {
    const morning = getEarthFixedSunDirection(Date.UTC(2026, 2, 20, 0))
    const evening = getEarthFixedSunDirection(Date.UTC(2026, 2, 20, 12))
    expect(Math.hypot(...morning)).toBeCloseTo(1, 8)
    expect(morning[0] * evening[0] + morning[1] * evening[1] + morning[2] * evening[2]).toBeLessThan(-0.9)
  })
})

describe('solar system snapshot', () => {
  it('returns finite heliocentric ecliptic positions for the sun, planets, and moon', () => {
    const snapshot = getSolarSystemSnapshot(Date.UTC(2026, 0, 1))

    expect(snapshot).toHaveLength(10)
    expect(snapshot.map((body) => body.id)).toEqual([
      'sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
    ])
    for (const body of snapshot) {
      expect(body.positionAu.every(Number.isFinite)).toBe(true)
    }
    expect(snapshot.find((body) => body.id === 'sun')?.positionAu).toEqual([0, 0, 0])
  })

  it('places the moon near the earth instead of at a separate heliocentric origin', () => {
    const snapshot = getSolarSystemSnapshot(Date.UTC(2026, 0, 1))
    const earth = snapshot.find((body) => body.id === 'earth')!
    const moon = snapshot.find((body) => body.id === 'moon')!
    const distance = Math.hypot(
      moon.positionAu[0] - earth.positionAu[0],
      moon.positionAu[1] - earth.positionAu[1],
      moon.positionAu[2] - earth.positionAu[2],
    )

    expect(distance).toBeGreaterThan(0.002)
    expect(distance).toBeLessThan(0.003)
  })
})
