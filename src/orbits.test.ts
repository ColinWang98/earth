import { describe, expect, it } from 'vitest'
import { getKeplerOrbitPath, propagateKeplerOrbit } from './orbits'

describe('small-body orbit propagation', () => {
  it('propagates a circular one-AU orbit by a quarter period', () => {
    const orbit = { epochJd: 2_451_545, semiMajorAu: 1, eccentricity: 0, inclinationDeg: 0, ascendingNodeDeg: 0, argumentOfPerihelionDeg: 0, meanAnomalyDeg: 0 }
    expect(propagateKeplerOrbit(orbit, orbit.epochJd)).toEqual([1, 0, 0])
    const quarter = propagateKeplerOrbit(orbit, orbit.epochJd + 365.256_898_3 / 4)
    expect(quarter[0]).toBeCloseTo(0, 5)
    expect(quarter[1]).toBeCloseTo(1, 5)
    expect(quarter[2]).toBeCloseTo(0, 8)
  })

  it('samples a finite inclined small-body orbit', () => {
    const orbit = { epochJd: 2_451_545, semiMajorAu: 2.7, eccentricity: 0.12, inclinationDeg: 12, ascendingNodeDeg: 80, argumentOfPerihelionDeg: 73, meanAnomalyDeg: 20 }
    const path = getKeplerOrbitPath(orbit, 72)
    expect(path).toHaveLength(72)
    expect(path.flat().every(Number.isFinite)).toBe(true)
    expect(Math.max(...path.map((point) => point[2])) - Math.min(...path.map((point) => point[2]))).toBeGreaterThan(0.5)
  })
})
