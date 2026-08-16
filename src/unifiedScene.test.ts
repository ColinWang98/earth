import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('unified earth and solar-system application boundary', () => {
  it('does not expose separate solar or stellar scene modes', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    expect(app).not.toContain('StellarScene')
    expect(app).not.toContain("simulation.mode === 'solar'")
    expect(app).not.toContain('scale-navigation')
  })

  it('ships no locator UI, target indicator, or automatic cruise state', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const navigation = readFileSync(new URL('./navigation.ts', import.meta.url), 'utf8')
    expect(app).not.toContain('object-search')
    expect(app).not.toContain('>定位<')
    expect(app).not.toContain('target-indicator')
    expect(scene).not.toContain('TargetTracker')
    expect(navigation).not.toContain('TargetIndicatorState')
    expect(app).not.toContain('巡航')
    expect(app).not.toContain('cruiseTo')
    expect(navigation).not.toContain('autopilotTargetId')
    expect(navigation).not.toContain('movingAutopilotPosition')
  })

  it('uses a latitude-aware Blue Marble fallback for Antarctic satellite gaps', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const surface = scene.slice(scene.indexOf('function EarthSurface'), scene.indexOf('function EarthGlobe'))
    expect(surface).toContain('southPolarWeight')
    expect(surface).toContain('polarCoverageA')
    expect(surface).toContain('polarCoverageB')
    expect(surface).toContain('mix(globalCoverageA,polarCoverageA,southPolarWeight)')
    expect(surface).toContain('polarNightBase')
  })

  it('renders enabled small bodies in orbit mode as well as flight mode', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const orbitEarth = scene.slice(scene.indexOf('function OrbitEarth'), scene.indexOf('function NasaModel'))
    expect(orbitEarth).toContain('showSmallBodies && solarContextVisible')
    expect(orbitEarth).toContain('<SmallBodies')
    expect(orbitEarth).toContain("band=\"solar\"")
    const smallBodies = scene.slice(scene.indexOf('function SmallBodies'), scene.indexOf('function FlightWorld'))
    expect(smallBodies).toContain('forceLabel sunDirection')
  })

  it('uses only observed clouds from NASA imagery', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    expect(scene).not.toContain('DynamicCloudLayer')
    expect(scene).not.toContain('CLOUD_MAP')
    expect(scene).not.toContain('动态云演示')
  })

  it('shows changing ephemeris coordinates in the object details', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    expect(app).toContain('日心坐标 (AU)')
    expect(app).toContain('数据时刻')
  })

  it('uses sun-driven atmospheric scattering instead of a constant translucent shell', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    expect(scene).toContain('rayleighStrength')
    expect(scene).toContain('mieStrength')
    expect(scene).toContain('sunsetWarmth')
    expect(scene).not.toContain('<meshBasicMaterial color={color} transparent opacity={0.11}')
  })

  it('uses a depth-tested 3D volumetric shell instead of a camera-facing ring', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const atmosphere = scene.slice(scene.indexOf('function Atmosphere'), scene.indexOf('function EarthSurface'))
    expect(atmosphere).toContain('sphereGeometry')
    expect(atmosphere).toContain('raySphereIntersection')
    expect(atmosphere).toContain('sampleDensity')
    expect(atmosphere).toContain('opticalDepth')
    expect(atmosphere).toContain("quality === 'desktop' ? 3 : 2")
    expect(atmosphere).not.toContain('Billboard')
    expect(atmosphere).not.toContain('ringGeometry')
    expect(atmosphere).not.toContain('depthTest={false}')
  })

  it('renders a structured solar surface and layered corona', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    expect(scene).toContain('limbDarkening')
    expect(scene).toContain('granulation')
    expect(scene).toContain('CoronaLayer')
    expect(scene).toContain('coronaPulse')
  })

  it('does not ship Gaia runtime or build tasks', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }
    expect(packageJson.scripts['data:gaia']).toBeUndefined()
  })
})
