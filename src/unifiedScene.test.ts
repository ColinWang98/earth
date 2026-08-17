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

  it('preloads a bundled NASA observation and fetches newer imagery only on request', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    expect(html).toContain('rel="preload"')
    expect(html).toContain('assets/earth-nasa-viirs-2026-08-15-4k.jpg')
    expect(app).toContain('更新卫星影像')
    expect(app).toContain('createEarthImageryRequest')
    expect(app).toContain('imageryRequest={imageryRequest}')
    expect(scene).toContain('if (requestId == null || requestUtcMs == null)')
    expect(scene).toContain('NASA_SNAPSHOT_MAP')
    expect(scene).toContain('预存 NASA VIIRS')
    const imageryHook = scene.slice(scene.indexOf('function useEarthObservationTexture'), scene.indexOf('function Atmosphere'))
    expect(imageryHook).toContain('const resolutionRef = useRef(resolution)')
    expect(imageryHook).toContain('const requestedResolution = resolutionRef.current')
    expect(imageryHook).not.toContain('resolution.height, resolution.label, resolution.width')
  })

  it('renders enabled small bodies in orbit mode as well as flight mode', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const orbitEarth = scene.slice(scene.indexOf('function OrbitEarth'), scene.indexOf('function NasaModel'))
    expect(orbitEarth).toContain('showSmallBodies && solarContextVisible')
    expect(orbitEarth).toContain('<SmallBodies')
    expect(orbitEarth).toContain("band=\"solar\"")
    const smallBodies = scene.slice(scene.indexOf('function SmallBodies'), scene.indexOf('function FlightWorld'))
    expect(smallBodies).toContain('<SmallBodyObject')
  })

  it('animates small bodies through a dedicated irregular-shape render path', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const smallBodies = scene.slice(scene.indexOf('function SmallBodies'), scene.indexOf('function FlightWorld'))
    expect(app).toContain('paused={simulation.paused}')
    expect(app).toContain('rate={simulation.rate}')
    expect(scene).toContain('function SmallBodyVisual')
    expect(scene).toContain('function ProceduralRock')
    expect(scene).toContain('SMALL_BODY_MODELS')
    expect(scene).toContain('frameSimulationUtcMs')
    expect(scene).toContain('writeSmallBodyRenderPosition')
    expect(scene).toContain('new THREE.IcosahedronGeometry')
    expect(smallBodies).not.toContain('<FloatingBody')
    expect(smallBodies).toContain('paused={paused}')
    expect(smallBodies).toContain('rate={rate}')
  })

  it('labels small-body rotation, axis accuracy, and shape provenance', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    expect(app).toContain('自转周期')
    expect(app).toContain('JPL 精确极轴')
    expect(app).toContain('示意轴（非精确观测）')
    expect(app).toContain('NASA VTAD 真实形状')
    expect(app).toContain('确定性程序岩石')
    expect(readme).toContain('NASA VTAD small-body shapes')
    expect(readme).toContain('https://science.nasa.gov/resource/bennu-3d-model/')
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

  it('rotates the Earth body continuously in an inertial frame', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    const globe = scene.slice(scene.indexOf('function EarthGlobe'), scene.indexOf('function StarCatalog'))
    expect(scene).toContain('function AstronomicalLighting')
    expect(scene).toContain('getEarthInertialSunDirection')
    expect(scene).not.toContain('getEarthFixedSunDirection')
    expect(globe).toContain('paused: boolean')
    expect(globe).toContain('rate: number')
    expect(globe).toContain('utcMs: number')
    expect(globe).toContain('frameSimulationUtcMs')
    expect(globe).toContain('earthRotationAngleRad(frameUtcMs)')
    expect(globe).toContain('rotation={[EARTH_AXIAL_TILT_RAD, 0, 0]}')
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

  it('enters only immersive VR and gives the headset a centered XR origin', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    expect(app).toContain('enterGrantedSession: false')
    expect(app).toContain('XROrigin position={[0, -1.6, 8]}')
  })

  it('keeps desktop camera controls out of VR and anchors its menu to the viewer', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    expect(scene).toContain('<IfInSessionMode deny="immersive-vr">')
    expect(scene).toContain('<XRSpace space="viewer">')
    expect(scene).toContain('position={[0, -0.45, -1.4]}')
    expect(app).toContain('<XROrigin position={[0, -1.6, 8]}><VRPresetMenu')
  })

  it('renders an opaque space shell behind the stars', () => {
    const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8')
    expect(scene).toContain('<sphereGeometry args={[320, 32, 16]} />')
    expect(scene).toContain('<meshBasicMaterial color="#010207" side={THREE.BackSide}')
  })
})
