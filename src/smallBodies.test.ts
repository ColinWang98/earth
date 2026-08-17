import { describe, expect, it } from 'vitest'
import { getSmallBodyStates, SMALL_BODIES } from './smallBodies'

describe('curated JPL small-body catalogue', () => {
  it('exposes the seven requested searchable targets with finite positions', () => {
    expect(SMALL_BODIES.map((body) => body.label)).toEqual(['谷神星', '灶神星', '爱神星', '贝努', '阿波菲斯', '哈雷彗星', '恩克彗星'])
    const states = getSmallBodyStates(Date.UTC(2026, 0, 1))
    expect(states).toHaveLength(7)
    expect(states.every((body) => body.positionAu.every(Number.isFinite))).toBe(true)
  })

  it('includes finite spin and irregular-shape metadata with explicit provenance', () => {
    expect(SMALL_BODIES.every((body) => Number.isFinite(body.rotationPeriodHours) && body.rotationPeriodHours > 0)).toBe(true)
    expect(SMALL_BODIES.every((body) => Number.isFinite(body.poleRaDeg) && Number.isFinite(body.poleDecDeg))).toBe(true)
    expect(SMALL_BODIES.every((body) => body.axisRatios.length === 3 && body.axisRatios.every((value) => Number.isFinite(value) && value > 0))).toBe(true)
    expect(SMALL_BODIES.filter((body) => body.axisSource === 'jpl').map((body) => body.label)).toEqual(['谷神星', '灶神星', '爱神星', '贝努'])
    expect(SMALL_BODIES.filter((body) => body.shapeModel != null).map((body) => body.shapeModel)).toEqual(['ceres', 'vesta', 'eros', 'bennu'])
  })
})
