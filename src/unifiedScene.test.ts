import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('unified earth and solar-system application boundary', () => {
  it('does not expose separate solar or stellar scene modes', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    expect(app).not.toContain('StellarScene')
    expect(app).not.toContain("simulation.mode === 'solar'")
    expect(app).not.toContain('scale-navigation')
  })

  it('keeps search manual and ships no automatic cruise state', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const navigation = readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8')
    expect(app).not.toContain('巡航')
    expect(app).not.toContain('cruiseTo')
    expect(navigation).not.toContain('autopilotTargetId')
    expect(navigation).not.toContain('movingAutopilotPosition')
  })

  it('does not ship Gaia runtime or build tasks', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }
    expect(packageJson.scripts['data:gaia']).toBeUndefined()
  })
})
