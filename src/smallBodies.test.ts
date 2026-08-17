import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

  it('ships four localized NASA shape models with source attribution', () => {
    const manifestUrl = new URL('../public/assets/small-bodies/sources.json', import.meta.url)
    expect(existsSync(manifestUrl)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as { credit: string; combinedBudgetBytes: number; models: Record<string, { path: string; source: string }> }
    expect(manifest.credit).toContain('NASA Visualization Technology Applications and Development')
    expect(Object.keys(manifest.models)).toEqual(['ceres', 'vesta', 'eros', 'bennu'])
    let combinedBytes = 0
    for (const model of Object.values(manifest.models)) {
      expect(model.source).toMatch(/^https:\/\/(science|assets\.science)\.nasa\.gov\//)
      const modelPath = fileURLToPath(new URL(`../public/${model.path}`, import.meta.url))
      expect(existsSync(modelPath)).toBe(true)
      combinedBytes += statSync(modelPath).size
    }
    expect(combinedBytes).toBeLessThan(manifest.combinedBudgetBytes)
  })
})
