import { describe, expect, it } from 'vitest'
import { adaptiveFlightSpeed, autopilotDuration, compressedRenderDistance, movingAutopilotPosition, nearestBody, selectSpaceBand } from './navigation'

describe('floating-origin navigation', () => {
  it('finds the nearest body in heliocentric AU coordinates', () => {
    const result = nearestBody([1.00005, 0, 0], [
      { id: 'sun', positionAu: [0, 0, 0] as [number, number, number], radiusKm: 696_340 },
      { id: 'earth', positionAu: [1, 0, 0] as [number, number, number], radiusKm: 6_371 },
    ])
    expect(result.id).toBe('earth')
    expect(result.distanceAu).toBeCloseTo(0.00005, 8)
  })

  it('keeps near distances detailed and compresses interplanetary distances monotonically', () => {
    const near = compressedRenderDistance(0.0001)
    const earthOrbit = compressedRenderDistance(1)
    const neptune = compressedRenderDistance(30)
    expect(near).toBeCloseTo(0.0001, 8)
    expect(near).toBeLessThan(earthOrbit)
    expect(earthOrbit).toBeLessThan(neptune)
    expect(neptune).toBeLessThan(8)
  })

  it('raises flight speed continuously as the observer leaves a body', () => {
    expect(adaptiveFlightSpeed(0.00005)).toBeLessThan(adaptiveFlightSpeed(0.01))
    expect(adaptiveFlightSpeed(0.01)).toBeLessThan(adaptiveFlightSpeed(10))
    expect(adaptiveFlightSpeed(0.0002) * 149_597_870.7).toBeLessThan(50)
  })

  it('uses stable semantic bands and bounded autopilot durations', () => {
    expect(selectSpaceBand(0.00002)).toBe('surface')
    expect(selectSpaceBand(0.0002)).toBe('surface')
    expect(selectSpaceBand(0.002)).toBe('surface')
    expect(selectSpaceBand(0.02)).toBe('orbital')
    expect(selectSpaceBand(1)).toBe('solar')
    expect(autopilotDuration(0.0001)).toBe(4)
    expect(autopilotDuration(30)).toBe(12)
  })

  it('tracks a moving target through the end of an autopilot cruise', () => {
    const result = movingAutopilotPosition([0, 0, 0], [2, 1, 0], [1, 0, 0], 0.1, 1)
    expect(result).toEqual([2.1, 1, 0])
  })
})
