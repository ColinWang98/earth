import { describe, expect, it } from 'vitest'
import { getSmallBodyStates, SMALL_BODIES } from './smallBodies'

describe('curated JPL small-body catalogue', () => {
  it('exposes the seven requested searchable targets with finite positions', () => {
    expect(SMALL_BODIES.map((body) => body.label)).toEqual(['谷神星', '灶神星', '爱神星', '贝努', '阿波菲斯', '哈雷彗星', '恩克彗星'])
    const states = getSmallBodyStates(Date.UTC(2026, 0, 1))
    expect(states).toHaveLength(7)
    expect(states.every((body) => body.positionAu.every(Number.isFinite))).toBe(true)
  })
})
