import { describe, expect, it } from 'vitest'
import { adaptiveFlightSpeed, compressedRenderDistance, effectiveObserverPosition, getTargetIndicatorState, nearestBody, selectSpaceBand } from './navigation'

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

  it('uses stable semantic bands', () => {
    expect(selectSpaceBand(0.00002)).toBe('surface')
    expect(selectSpaceBand(0.0002)).toBe('surface')
    expect(selectSpaceBand(0.002)).toBe('surface')
    expect(selectSpaceBand(0.02)).toBe('orbital')
    expect(selectSpaceBand(1)).toBe('solar')
  })

  it('keeps an orbit observer attached to the current earth position', () => {
    const orbitNavigation = { controlMode: 'orbit' as const, observerHelioAu: [1, 2, 3] as [number, number, number], orientation: [0, 0, 0, 1] as [number, number, number, number], speedAuPerSecond: 0.001, band: 'surface' as const }
    expect(effectiveObserverPosition(orbitNavigation, [0.8, 0.4, -0.2], 0.0002)).toEqual([0.8, 0.39980000000000004, -0.2])
    expect(effectiveObserverPosition({ ...orbitNavigation, controlMode: 'flight' }, [0.8, 0.4, -0.2], 0.0002)).toEqual([1, 2, 3])
  })

  it('keeps an off-screen target indicator on the viewport edge without moving the observer', () => {
    expect(getTargetIndicatorState('mars', [1.8, 0.4, 0.5], '0.52 AU')).toEqual({
      objectId: 'mars', onScreen: false, screenPosition: [0.88, 0.19555555555555557], directionAngleRad: Math.atan2(0.4, 1.8), distanceLabel: '0.52 AU',
    })
    expect(getTargetIndicatorState('earth', [0.2, -0.1, 0.2], '10,000 km').onScreen).toBe(true)
    expect(getTargetIndicatorState('venus', [1.5, -0.5, 1.2], '1 AU').screenPosition[0]).toBeLessThan(0)
  })
})
