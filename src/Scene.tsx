import { useEffect, useMemo, useRef, useState } from 'react'
import { Billboard, OrbitControls, Text, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { getEarthFixedSunDirection, getMoonOrbitPath, getPlanetOrbitPath, getSolarSystemSnapshot, type CelestialBodyId, type CelestialBodyState } from './astro'
import { buildGibsWmsUrl, chooseEarthImagery, disposeReplacedTextures, estimateImageCoverage, getEarthResolutionFallbacks, getImageryBlendFrames, selectEarthResolution, type EarthResolution } from './earthImagery'
import { adaptiveFlightSpeed, compressedRenderDistance, getTargetIndicatorState, nearestBody, selectSpaceBand, type AuVector, type NavigationState, type SpaceBand, type TargetIndicatorState } from './navigation'
import { getKeplerOrbitPath, propagateKeplerOrbit, type KeplerOrbit } from './orbits'
import { SMALL_BODIES, type SmallBodyRecord } from './smallBodies'

export const CAMERA_PRESETS = [
  { id: 'orbit', label: '默认轨道', position: [0, 1.25, 9], duration: 1.5 },
  { id: 'sunlit', label: '日照侧环绕', position: [5.8, 2.5, 6.4], duration: 2.2 },
  { id: 'atmosphere', label: '贴近大气层', position: [0.2, 0.7, 3.08], duration: 3.4 },
  { id: 'clouds', label: '卫星云图', position: [2.6, 0.4, 2.8], duration: 4.2 },
  { id: 'china', label: '东亚近景', position: [0.15, 0.38, 2.92], duration: 4.1 },
] as const

export type CameraPresetId = typeof CAMERA_PRESETS[number]['id']
type Quality = 'desktop' | 'mobile'
type Motion = { active: boolean, target: THREE.Vector3, duration: number }

export interface EarthObservationStatus {
  source: string
  label: string
  date?: string
  fallback: boolean
  resolution: EarthResolution['label']
}

type Props = {
  annotations: boolean
  navigation: NavigationState
  preset: CameraPresetId
  quality: Quality
  selectedObjectId?: string
  targetPositionAu?: AuVector
  targetDistanceLabel?: string
  showSmallBodies: boolean
  frameP95Ms: number | null
  utcMs: number
  onNavigationChange: (state: NavigationState) => void
  onObservationStatus: (status: EarthObservationStatus) => void
  onPresetChange: (preset: CameraPresetId) => void
  onSelect: (id: string) => void
  onSkyReady: () => void
  onTargetIndicator: (indicator: TargetIndicatorState | null) => void
}

const AU_KM = 149_597_870.7
const J2000_MS = Date.UTC(2000, 0, 1, 12)
const DAY_MAP = `${import.meta.env.BASE_URL}assets/earth-blue-marble-5k.jpg`
const NIGHT_MAP = `${import.meta.env.BASE_URL}assets/earth-night.png`
const OCEAN_MASK = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`
const SUN_MAP = `${import.meta.env.BASE_URL}assets/sun-real.jpg`
const STAR_CATALOG = `${import.meta.env.BASE_URL}assets/stars/hyg-bright-stars.bin`
const SMALL_BODY_SUN_DIRECTION = new THREE.Vector3(1, 0, 0)
const DEFAULT_ATMOSPHERE_SUN_DIRECTION = new THREE.Vector3(1, 0.2, 0.4).normalize()

const PLANET_VISUALS: Record<string, { color: string; texture?: string; tilt: number; periodDays: number; flattening?: number; atmosphere?: string; rings?: 'saturn' | 'uranus'; model?: string }> = {
  mercury: { color: '#a7a39d', tilt: 0.034, periodDays: 58.646, model: `${import.meta.env.BASE_URL}assets/planets/mercury.glb` },
  venus: { color: '#d49a45', texture: `${import.meta.env.BASE_URL}assets/planets/venus.webp`, tilt: 177.36, periodDays: -243.025, atmosphere: '#e8b45d' },
  earth: { color: '#4b90d9', tilt: 23.44, periodDays: 0.99726968, flattening: 0.99665, atmosphere: '#3b92ff' },
  moon: { color: '#cbc7bc', texture: MOON_MAP, tilt: 6.68, periodDays: 27.321661 },
  mars: { color: '#bd5b36', texture: `${import.meta.env.BASE_URL}assets/planets/mars.webp`, tilt: 25.19, periodDays: 1.025957, flattening: 0.994, atmosphere: '#c56c4c' },
  jupiter: { color: '#c79b72', texture: `${import.meta.env.BASE_URL}assets/planets/jupiter.webp`, tilt: 3.13, periodDays: 0.41354, flattening: 0.935, atmosphere: '#d6b28e' },
  saturn: { color: '#d8c38d', texture: `${import.meta.env.BASE_URL}assets/planets/saturn.webp`, tilt: 26.73, periodDays: 0.444, flattening: 0.902, atmosphere: '#d7c38e', rings: 'saturn' },
  uranus: { color: '#8bcdd4', tilt: 97.77, periodDays: -0.718, flattening: 0.977, atmosphere: '#8fdde7', rings: 'uranus', model: `${import.meta.env.BASE_URL}assets/planets/uranus.glb` },
  neptune: { color: '#315fcb', texture: `${import.meta.env.BASE_URL}assets/planets/neptune.webp`, tilt: 28.32, periodDays: 0.6713, flattening: 0.983, atmosphere: '#346be8' },
}

function useTexture(url: string, quality: Quality, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace) {
  const texture = useMemo(() => {
    const next = new THREE.TextureLoader().load(url)
    next.colorSpace = colorSpace
    next.generateMipmaps = true
    next.minFilter = THREE.LinearMipmapLinearFilter
    next.anisotropy = quality === 'desktop' ? 8 : 3
    return next
  }, [url, quality, colorSpace])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function loadImage(url: string, timeoutMs = 20_000) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => {
      image.src = ''
      reject(new Error(`Timed out loading ${url}`))
    }, timeoutMs)
    image.crossOrigin = 'anonymous'
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error(`Unable to load ${url}`)) }
    image.src = url
  })
}

async function probeCoverage(layer: string, date: string) {
  const image = await loadImage(buildGibsWmsUrl(layer, date, 256, 128))
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return 0
  context.drawImage(image, 0, 0, 256, 128)
  return estimateImageCoverage(context.getImageData(0, 0, 256, 128).data)
}

type EarthObservationTextures = { base: THREE.Texture; primary: THREE.Texture; secondary: THREE.Texture; mix: number; resolution: EarthResolution }

function makeObservationTexture(image: HTMLImageElement, quality: Quality, generateMipmaps: boolean) {
  const texture = new THREE.Texture(image)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = generateMipmaps
  texture.minFilter = generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  texture.anisotropy = quality === 'desktop' ? 8 : 3
  texture.needsUpdate = true
  return texture
}

function useEarthObservationTexture(utcMs: number, quality: Quality, closeView: boolean, frameP95Ms: number | null, onStatus: (status: EarthObservationStatus) => void) {
  const fallback = useTexture(DAY_MAP, quality)
  const { gl } = useThree()
  const resolution = selectEarthResolution({ quality, closeView, maxTextureSize: gl.capabilities.maxTextureSize, deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, frameP95Ms })
  const frames = getImageryBlendFrames(utcMs)
  const [textures, setTextures] = useState<EarthObservationTextures>({ base: fallback, primary: fallback, secondary: fallback, mix: 0, resolution })
  const owned = useRef<THREE.Texture[]>([])

  useEffect(() => {
    let cancelled = false
    let retireTimer: number | undefined
    const choice = chooseEarthImagery(Date.parse(`${frames.primaryDate}T12:00:00.000Z`))
    const useFallback = (label: string) => {
      if (cancelled) return
      setTextures({ base: fallback, primary: fallback, secondary: fallback, mix: 0, resolution })
      onStatus({ source: 'NASA Blue Marble', label: `${label} · ${resolution.label} · 无实时云层`, fallback: true, resolution: resolution.label })
    }
    const load = async () => {
      if (choice.kind === 'fallback') {
        useFallback(choice.reason === 'future-date' ? '未来日期无卫星观测 · 使用 Blue Marble' : '卫星时代之前 · 使用 Blue Marble')
        return
      }
      onStatus({ source: 'NASA GIBS', label: choice.kind === 'recent' ? `正在寻找最新完整卫星观测 · ${resolution.label}…` : `正在加载 ${choice.date} 卫星观测 · ${resolution.label}…`, fallback: false, resolution: resolution.label })
      try {
        let date: string | undefined
        if (choice.kind === 'recent') {
          for (const candidate of choice.dates) {
            if (await probeCoverage(choice.layer, candidate) >= 0.55) { date = candidate; break }
          }
        } else if (await probeCoverage(choice.layer, choice.date) >= 0.08) date = choice.date
        if (!date) throw new Error('No useful coverage')
        let actualResolution = resolution
        let primaryImage: HTMLImageElement | undefined
        for (const candidate of getEarthResolutionFallbacks(resolution)) {
          try {
            primaryImage = await loadImage(buildGibsWmsUrl(choice.layer, date, candidate.width, candidate.height))
            actualResolution = candidate
            break
          } catch {
            // Retry a failed 8K request at 4K before using Blue Marble.
          }
        }
        if (!primaryImage) throw new Error('Unable to load observation image')
        let secondaryImage: HTMLImageElement | undefined
        if (choice.kind === 'dated' && frames.secondaryDate && await probeCoverage(choice.layer, frames.secondaryDate) >= 0.08) {
          const secondaryWidth = Math.min(4096, actualResolution.width)
          secondaryImage = await loadImage(buildGibsWmsUrl(choice.layer, frames.secondaryDate, secondaryWidth, secondaryWidth / 2))
        }
        if (cancelled) return
        const primary = makeObservationTexture(primaryImage, quality, actualResolution.label !== '8K')
        const secondary = secondaryImage ? makeObservationTexture(secondaryImage, quality, true) : primary
        const nextOwned = secondary === primary ? [primary] : [primary, secondary]
        const previous = owned.current
        owned.current = nextOwned
        setTextures({ base: fallback, primary, secondary, mix: secondaryImage ? frames.mix : 0, resolution: actualResolution })
        const delayHours = Math.max(0, (Date.now() - Date.parse(`${date}T12:00:00.000Z`)) / 3_600_000)
        onStatus({ source: choice.layer.startsWith('VIIRS') ? 'NASA GIBS · VIIRS/Suomi NPP' : 'NASA GIBS · MODIS/Terra', label: `${choice.kind === 'recent' ? `${date} 近实时卫星真彩 · 约 ${Math.round(delayHours)} 小时延迟` : `${date} 历史卫星真彩`} · ${actualResolution.label} · 真彩图含实测云层`, date, fallback: false, resolution: actualResolution.label })
        if (previous.length) retireTimer = window.setTimeout(() => disposeReplacedTextures(previous), 1_500)
      } catch {
        useFallback('NASA GIBS 暂不可用 · 使用 Blue Marble')
      }
    }
    void load()
    return () => { cancelled = true; if (retireTimer) window.clearTimeout(retireTimer) }
  }, [fallback, frames.primaryDate, frames.secondaryDate, onStatus, quality, resolution.height, resolution.label, resolution.width])

  useEffect(() => () => disposeReplacedTextures(owned.current), [])
  return { ...textures, mix: textures.secondary === textures.primary ? 0 : frames.mix }
}

function Atmosphere({ radius, segments, sunDirection = DEFAULT_ATMOSPHERE_SUN_DIRECTION, color = '#3b92ff' }: { radius: number; segments: number; sunDirection?: THREE.Vector3; color?: string }) {
  const outerRadius = radius * 1.018
  const billboard = useRef<THREE.Group>(null)
  const worldCenter = useMemo(() => new THREE.Vector3(), [])
  const worldScale = useMemo(() => new THREE.Vector3(), [])
  const cameraWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const uniforms = useMemo(() => ({
    atmosphereColor: { value: new THREE.Color(color) },
    sunDirection: { value: sunDirection.clone() },
    innerRadius: { value: radius },
    outerRadius: { value: outerRadius },
    projectedInnerRadius: { value: radius },
    projectedOuterRadius: { value: outerRadius },
  }), [color, outerRadius, radius])
  useFrame(({ camera }) => {
    uniforms.sunDirection.value.copy(sunDirection)
    if (!billboard.current) return
    billboard.current.getWorldPosition(worldCenter)
    billboard.current.getWorldScale(worldScale)
    camera.getWorldPosition(cameraWorldPosition)
    const scale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z))
    const distance = Math.max(cameraWorldPosition.distanceTo(worldCenter), outerRadius * scale * 1.001)
    const innerRatio = Math.min(radius * scale / distance, 0.999)
    const outerRatio = Math.min(outerRadius * scale / distance, 0.999)
    uniforms.projectedInnerRadius.value = radius / Math.sqrt(1 - innerRatio * innerRatio)
    uniforms.projectedOuterRadius.value = outerRadius / Math.sqrt(1 - outerRatio * outerRatio)
  })
  return <Billboard ref={billboard} follow>
    <mesh renderOrder={4}>
      <ringGeometry args={[radius, outerRadius, Math.min(segments, 96)]} />
      <shaderMaterial transparent depthTest={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} uniforms={uniforms} vertexShader={`
        uniform float innerRadius; uniform float outerRadius; uniform float projectedInnerRadius; uniform float projectedOuterRadius; uniform vec3 sunDirection;
        varying float vOpticalDepth; varying float vSolarAltitude; varying float vScatteringCosine;
        void main(){
          float normalizedHeight=clamp((length(position.xy)-innerRadius)/(outerRadius-innerRadius),0.0,1.0);
          float density=exp(-normalizedHeight*5.5);
          float tangentPathLength=sqrt(max(1.0-normalizedHeight,0.0));
          float opticalDepth=1.0-exp(-tangentPathLength*density*3.2);
          vec2 radialDirection=normalize(position.xy);
          float projectedRadius=mix(projectedInnerRadius,projectedOuterRadius,normalizedHeight);
          vec3 projectedPosition=vec3(radialDirection*projectedRadius,position.z);
          vec4 worldPosition=modelMatrix*vec4(projectedPosition,1.0);
          vec3 sampleNormal=normalize(mat3(modelMatrix)*vec3(radialDirection,0.0));
          vec3 rayDirection=normalize(worldPosition.xyz-cameraPosition);
          vOpticalDepth=opticalDepth;
          vSolarAltitude=dot(sampleNormal,normalize(sunDirection));
          vScatteringCosine=dot(rayDirection,normalize(sunDirection));
          gl_Position=projectionMatrix*viewMatrix*worldPosition;
        }
      `} fragmentShader={`
        uniform vec3 atmosphereColor;
        varying float vOpticalDepth; varying float vSolarAltitude; varying float vScatteringCosine;
        void main(){
          float dayLight=smoothstep(-0.055,0.16,vSolarAltitude);
          float rayleighPhase=0.72+0.28*vScatteringCosine*vScatteringCosine;
          float rayleighStrength=vOpticalDepth*dayLight*rayleighPhase;
          float forwardScatter=max(vScatteringCosine,0.0);
          float forwardSquared=forwardScatter*forwardScatter;
          float forwardFourth=forwardSquared*forwardSquared;
          float forwardEighth=forwardFourth*forwardFourth;
          forwardScatter=forwardEighth*forwardEighth*forwardSquared;
          float mieStrength=vOpticalDepth*forwardScatter*dayLight*0.16;
          float sunsetWarmth=vOpticalDepth*smoothstep(-0.07,-0.005,vSolarAltitude)*(1.0-smoothstep(-0.005,0.075,vSolarAltitude));
          vec3 rayleighColor=atmosphereColor*rayleighStrength;
          vec3 mieColor=vec3(1.0,0.78,0.48)*mieStrength;
          vec3 sunsetColor=vec3(1.0,0.24,0.035)*sunsetWarmth*0.18;
          float alpha=clamp(rayleighStrength*0.52+mieStrength*0.3+sunsetWarmth*0.12,0.0,0.58);
          gl_FragColor=vec4(rayleighColor+mieColor+sunsetColor,alpha);
        }
      `} />
    </mesh>
  </Billboard>
}

function EarthSurface({ baseMap, dayMaps, dayMix, nightMap, oceanMask, radius, segments, sunDirection }: { baseMap: THREE.Texture; dayMaps: [THREE.Texture, THREE.Texture]; dayMix: number; nightMap: THREE.Texture; oceanMask: THREE.Texture; radius: number; segments: number; sunDirection: THREE.Vector3 }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  useFrame(() => {
    if (material.current) {
      material.current.uniforms.dayMapA.value = dayMaps[0]
      material.current.uniforms.dayMapB.value = dayMaps[1]
      material.current.uniforms.dayMix.value = THREE.MathUtils.smoothstep(dayMix, 0, 1)
      material.current.uniforms.sunDirection.value.copy(sunDirection)
    }
  })
  return <mesh>
    <sphereGeometry args={[radius, segments, segments]} />
    <shaderMaterial ref={material} uniforms={{ baseMap: { value: baseMap }, dayMapA: { value: dayMaps[0] }, dayMapB: { value: dayMaps[1] }, dayMix: { value: dayMix }, nightMap: { value: nightMap }, oceanMask: { value: oceanMask }, sunDirection: { value: sunDirection } }} vertexShader={`
      varying vec2 vUv; varying vec3 vNormal;
      void main(){ vUv=uv; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
    `} fragmentShader={`
      uniform sampler2D baseMap; uniform sampler2D dayMapA; uniform sampler2D dayMapB; uniform sampler2D nightMap; uniform sampler2D oceanMask;
      uniform float dayMix; uniform vec3 sunDirection; varying vec2 vUv; varying vec3 vNormal;
      void main(){
        float lightDot=dot(normalize(vNormal),normalize(sunDirection));
        float daylight=smoothstep(-0.18,0.22,lightDot);
        vec3 base=texture2D(baseMap,vUv).rgb;
        vec3 observedA=texture2D(dayMapA,vUv).rgb;
        vec3 observedB=texture2D(dayMapB,vUv).rgb;
        float coverageA=smoothstep(0.015,0.065,max(observedA.r,max(observedA.g,observedA.b)));
        float coverageB=smoothstep(0.015,0.065,max(observedB.r,max(observedB.g,observedB.b)));
        vec3 dayA=mix(base,observedA,coverageA);
        vec3 dayB=mix(base,observedB,coverageB);
        vec3 day=mix(dayA,dayB,dayMix);
        vec3 night=texture2D(nightMap,vUv).rgb;
        float ocean=texture2D(oceanMask,vUv).r;
        vec3 lit=day*(0.18+0.92*max(lightDot,0.0));
        lit+=vec3(0.05,0.12,0.22)*pow(max(lightDot,0.0),22.0)*ocean;
        gl_FragColor=vec4(mix(night*0.65,lit,daylight),1.0);
      }
    `} />
  </mesh>
}

function EarthGlobe({ baseMap, dayMaps, dayMix, quality, radius, sunDirection }: { baseMap: THREE.Texture; dayMaps: [THREE.Texture, THREE.Texture]; dayMix: number; quality: Quality; radius: number; sunDirection: THREE.Vector3 }) {
  const night = useTexture(NIGHT_MAP, quality)
  const ocean = useTexture(OCEAN_MASK, quality, THREE.NoColorSpace)
  const segments = quality === 'desktop' ? 128 : 72
  return <group>
    <EarthSurface baseMap={baseMap} dayMaps={dayMaps} dayMix={dayMix} nightMap={night} oceanMask={ocean} radius={radius} segments={segments} sunDirection={sunDirection} />
    <Atmosphere radius={radius} segments={segments} sunDirection={sunDirection} />
  </group>
}

function StarCatalog({ onReady, quality }: { onReady: () => void; quality: Quality }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let disposed = false
    let next: THREE.BufferGeometry | null = null
    fetch(STAR_CATALOG).then((response) => response.arrayBuffer()).then((buffer) => {
      if (disposed) return
      const source = new Float32Array(buffer)
      const count = Math.min(source.length / 5, quality === 'desktop' ? 1250 : 850)
      const positions = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)
      const color = new THREE.Color()
      for (let index = 0; index < count; index += 1) {
        positions.set([source[index * 5] * 260, source[index * 5 + 1] * 260, source[index * 5 + 2] * 260], index * 3)
        const bv = source[index * 5 + 3]
        color.set(bv < 0.2 ? '#a9c5ff' : bv < 0.8 ? '#fff3db' : '#ffbd82')
        colors.set(color.toArray(), index * 3)
      }
      next = new THREE.BufferGeometry()
      next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      next.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      setGeometry(next)
      onReady()
    })
    return () => { disposed = true; next?.dispose() }
  }, [onReady, quality])
  if (!geometry) return null
  return <points geometry={geometry} frustumCulled={false}><pointsMaterial size={quality === 'desktop' ? 0.95 : 0.78} sizeAttenuation={false} vertexColors transparent opacity={0.56} depthWrite={false} /></points>
}

function TargetTracker({ objectId, positionAu, observerAu, distanceLabel, onChange }: { objectId: string; positionAu: AuVector; observerAu: AuVector; distanceLabel: string; onChange: (indicator: TargetIndicatorState | null) => void }) {
  const { camera } = useThree()
  const projected = useMemo(() => new THREE.Vector3(), [])
  const lastUpdate = useRef(0)
  const previous = useRef<TargetIndicatorState | null>(null)
  useFrame(() => {
    if (performance.now() - lastUpdate.current < 120) return
    lastUpdate.current = performance.now()
    projected.set(positionAu[0] - observerAu[0], positionAu[2] - observerAu[2], observerAu[1] - positionAu[1])
    if (projected.lengthSq() < 1e-14) {
      if (previous.current) { previous.current = null; onChange(null) }
      return
    }
    projected.normalize().multiplyScalar(20).project(camera)
    const next = getTargetIndicatorState(objectId, [projected.x, projected.y, projected.z], distanceLabel)
    const changed = !previous.current || previous.current.objectId !== next.objectId || previous.current.onScreen !== next.onScreen || previous.current.distanceLabel !== next.distanceLabel || Math.abs(previous.current.screenPosition[0] - next.screenPosition[0]) > 0.01 || Math.abs(previous.current.screenPosition[1] - next.screenPosition[1]) > 0.01
    if (changed) { previous.current = next; onChange(next) }
  })
  useEffect(() => () => onChange(null), [onChange])
  return null
}

function CameraDirector({ preset, controls, motion }: { preset: CameraPresetId; controls: React.RefObject<OrbitControlsImpl | null>; motion: React.MutableRefObject<Motion> }) {
  const { camera, gl } = useThree()
  const origin = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => {
    const item = CAMERA_PRESETS.find((entry) => entry.id === preset) ?? CAMERA_PRESETS[0]
    motion.current = { active: true, target: new THREE.Vector3(...item.position), duration: item.duration }
  }, [preset, motion])
  useFrame((_, delta) => {
    if (gl.xr.isPresenting || !motion.current.active) return
    const blend = 1 - Math.exp(-delta * 4 / motion.current.duration)
    camera.position.lerp(motion.current.target, blend)
    controls.current?.target.lerp(origin, blend)
    controls.current?.update()
    if (camera.position.distanceTo(motion.current.target) < 0.015) motion.current.active = false
  })
  return null
}

function OrbitEarth({ annotations, dayMap, preset, quality, sunDirection, utcMs }: { annotations: boolean; dayMap: EarthObservationTextures; preset: CameraPresetId; quality: Quality; sunDirection: THREE.Vector3; utcMs: number }) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const motion = useRef<Motion>({ active: false, target: new THREE.Vector3(...CAMERA_PRESETS[0].position), duration: 1.5 })
  const moonMap = useTexture(MOON_MAP, quality)
  const moonScale = 28.3 / 0.00257
  const moonEpoch = Math.floor(utcMs / 86_400_000) * 86_400_000
  const moonOrbitGeometry = useMemo(() => {
    const points = getMoonOrbitPath(moonEpoch, quality === 'desktop' ? 160 : 96).map((point) => new THREE.Vector3(point[0], point[2], -point[1]).multiplyScalar(moonScale))
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [moonEpoch, quality])
  useEffect(() => () => moonOrbitGeometry.dispose(), [moonOrbitGeometry])
  const moonPosition = useMemo(() => {
    const snapshot = getSolarSystemSnapshot(utcMs)
    const earth = snapshot.find((body) => body.id === 'earth')!
    const moon = snapshot.find((body) => body.id === 'moon')!
    return new THREE.Vector3(moon.positionAu[0] - earth.positionAu[0], moon.positionAu[2] - earth.positionAu[2], earth.positionAu[1] - moon.positionAu[1]).multiplyScalar(moonScale)
  }, [utcMs, moonScale])
  const sunMarkerPosition = useMemo(() => sunDirection.clone().multiplyScalar(42), [sunDirection])
  return <>
    <EarthGlobe baseMap={dayMap.base} dayMaps={[dayMap.primary, dayMap.secondary]} dayMix={dayMap.mix} quality={quality} radius={2.25} sunDirection={sunDirection} />
    <lineLoop geometry={moonOrbitGeometry}><lineBasicMaterial color="#8eb6d2" transparent opacity={0.3} /></lineLoop>
    <mesh position={moonPosition}><sphereGeometry args={[0.58, quality === 'desktop' ? 64 : 36, quality === 'desktop' ? 64 : 36]} /><meshStandardMaterial map={moonMap} roughness={1} /></mesh>
    <group position={sunMarkerPosition} scale={1.25}><SunVisual detailed={false} quality={quality} /></group>
    {annotations && <><Text position={[0, 2.75, 0]} fontSize={0.18} color="#d9efff">NASA 近实时真彩地球</Text><Text position={[moonPosition.x, moonPosition.y + 0.9, moonPosition.z]} fontSize={0.16} color="#d9efff">月球 · 真实轨道方向</Text><Text position={[sunMarkerPosition.x, sunMarkerPosition.y + 1.8, sunMarkerPosition.z]} fontSize={0.18} color="#ffdca0">太阳方向示意</Text></>}
    <CameraDirector preset={preset} controls={controls} motion={motion} />
    <OrbitControls ref={controls} enableDamping dampingFactor={0.06} minDistance={2.72} maxDistance={45} target={[0, 0, 0]} onStart={() => { motion.current.active = false }} />
  </>
}

function NasaModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  const scale = useMemo(() => {
    const size = new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3())
    return 2 / Math.max(size.x, size.y, size.z, 0.0001)
  }, [clone])
  return <primitive object={clone} scale={scale} />
}

function RingSystem({ kind }: { kind: 'saturn' | 'uranus' }) {
  const inner = kind === 'saturn' ? 1.28 : 1.45
  const outer = kind === 'saturn' ? 2.3 : 1.95
  return <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
    <ringGeometry args={[inner, outer, 160]} />
    <shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide} uniforms={{ ringColor: { value: new THREE.Color(kind === 'saturn' ? '#d8c9a5' : '#6b8b91') }, opacity: { value: kind === 'saturn' ? 0.78 : 0.3 } }} vertexShader={`varying vec2 p; void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`} fragmentShader={`uniform vec3 ringColor; uniform float opacity; varying vec2 p; void main(){float r=length(p);float bands=0.45+0.55*sin(r*58.0)+0.2*sin(r*131.0);float edge=smoothstep(${inner.toFixed(2)},${(inner + 0.05).toFixed(2)},r)*(1.0-smoothstep(${(outer - 0.05).toFixed(2)},${outer.toFixed(2)},r));gl_FragColor=vec4(ringColor,edge*opacity*(0.5+0.35*bands));}`} />
  </mesh>
}

function CoronaLayer({ scale, opacity, speed, quality }: { scale: number; opacity: number; speed: number; quality: Quality }) {
  const uniforms = useMemo(() => ({ time: { value: 0 }, opacity: { value: opacity } }), [opacity])
  useFrame((_, delta) => { uniforms.time.value += delta * speed })
  return <mesh scale={scale} renderOrder={2}>
    <sphereGeometry args={[1, quality === 'desktop' ? 48 : 24, quality === 'desktop' ? 36 : 18]} />
    <shaderMaterial transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} uniforms={uniforms} vertexShader={`
      varying vec3 vWorldPosition; varying vec3 vWorldNormal;
      void main(){vec4 worldPosition=modelMatrix*vec4(position,1.0);vWorldPosition=worldPosition.xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*worldPosition;}
    `} fragmentShader={`
      uniform float time; uniform float opacity; varying vec3 vWorldPosition; varying vec3 vWorldNormal;
      void main(){
        vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
        float rim=pow(1.0-abs(dot(normalize(vWorldNormal),viewDirection)),1.55);
        float angle=atan(vWorldNormal.y,vWorldNormal.x);
        float filaments=0.68+0.2*sin(angle*13.0+time*0.18)+0.12*sin(angle*29.0-time*0.11);
        float coronaPulse=0.94+0.06*sin(time*0.45+angle*5.0);
        gl_FragColor=vec4(vec3(1.0,0.38,0.08)*filaments*coronaPulse,rim*opacity);
      }
    `} />
  </mesh>
}

function SunVisual({ detailed, quality }: { detailed: boolean; quality: Quality }) {
  const map = useTexture(SUN_MAP, quality)
  const uniforms = useMemo(() => ({ map: { value: map }, time: { value: 0 } }), [map])
  useFrame((_, delta) => { uniforms.time.value += delta })
  return <group>
    <mesh><sphereGeometry args={[1, detailed ? 96 : 40, detailed ? 72 : 28]} /><shaderMaterial uniforms={uniforms} vertexShader={`
      varying vec2 vUv; varying vec3 vWorldPosition; varying vec3 vWorldNormal;
      void main(){vUv=uv;vec4 worldPosition=modelMatrix*vec4(position,1.0);vWorldPosition=worldPosition.xyz;vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*worldPosition;}
    `} fragmentShader={`
      uniform sampler2D map; uniform float time; varying vec2 vUv; varying vec3 vWorldPosition; varying vec3 vWorldNormal;
      void main(){
        float latitude=abs(vUv.y-0.5)*2.0;
        float differentialRotation=time*(0.0019-0.00055*latitude*latitude);
        vec2 uv=vec2(fract(vUv.x+differentialRotation),vUv.y+0.0025*sin(vUv.x*20.0+time*0.08));
        vec3 surface=texture2D(map,uv).rgb;
        float granulation=0.5+0.24*sin(uv.x*137.0+sin(uv.y*91.0))+0.18*sin(uv.y*173.0-time*0.12)+0.08*sin((uv.x+uv.y)*311.0);
        vec3 viewDirection=normalize(cameraPosition-vWorldPosition);
        float mu=clamp(dot(normalize(vWorldNormal),viewDirection),0.0,1.0);
        float limbDarkening=0.48+0.52*pow(mu,0.58);
        float faculae=(1.0-mu)*smoothstep(0.62,0.92,granulation)*0.22;
        vec3 temperatureTint=mix(vec3(1.0,0.23,0.025),vec3(1.0,0.78,0.32),clamp(surface.r*1.25,0.0,1.0));
        vec3 color=mix(surface*1.25,temperatureTint,0.28)*(0.9+granulation*0.25+faculae)*limbDarkening;
        gl_FragColor=vec4(color,1.0);
      }
    `} /></mesh>
    <CoronaLayer scale={1.12} opacity={0.28} speed={1} quality={quality} />
    {quality === 'desktop' && <CoronaLayer scale={detailed ? 1.34 : 1.25} opacity={0.15} speed={0.68} quality={quality} />}
    {quality === 'desktop' && detailed && <CoronaLayer scale={1.62} opacity={0.075} speed={0.42} quality={quality} />}
  </group>
}

function TexturedPlanet({ body, quality, sunDirection, utcMs }: { body: CelestialBodyState; quality: Quality; sunDirection: THREE.Vector3; utcMs: number }) {
  const visual = PLANET_VISUALS[body.id]!
  const map = useTexture(visual.texture ?? MOON_MAP, quality)
  const rotation = visual ? (utcMs - J2000_MS) / 86_400_000 / visual.periodDays * Math.PI * 2 : 0
  return <group rotation={[0, 0, THREE.MathUtils.degToRad(visual?.tilt ?? 0)]}>
    <group rotation={[0, rotation, 0]} scale={[1, visual?.flattening ?? 1, 1]}>
      {visual?.model ? <NasaModel url={visual.model} /> : <mesh><sphereGeometry args={[1, quality === 'desktop' ? 72 : 40, quality === 'desktop' ? 56 : 30]} /><meshStandardMaterial map={map} color={visual?.color ?? body.color} roughness={body.id === 'jupiter' || body.id === 'saturn' ? 0.78 : 0.94} /></mesh>}
    </group>
    {visual?.atmosphere && <Atmosphere radius={1} segments={quality === 'desktop' ? 64 : 32} color={visual.atmosphere} sunDirection={sunDirection} />}
    {visual?.rings && <RingSystem kind={visual.rings} />}
  </group>
}

function DetailedPlanet({ body, dayMap, quality, sunDirection, utcMs }: { body: CelestialBodyState; dayMap: EarthObservationTextures; quality: Quality; sunDirection: THREE.Vector3; utcMs: number }) {
  if (body.id === 'earth') return <EarthGlobe baseMap={dayMap.base} dayMaps={[dayMap.primary, dayMap.secondary]} dayMix={dayMap.mix} quality={quality} radius={1} sunDirection={sunDirection} />
  if (body.id === 'sun') return <SunVisual detailed quality={quality} />
  return <TexturedPlanet body={body} quality={quality} sunDirection={sunDirection} utcMs={utcMs} />
}

function planetPosition(body: CelestialBodyState, observer: AuVector, band: SpaceBand, target: THREE.Vector3) {
  const x = body.positionAu[0] - observer[0]
  const y = body.positionAu[1] - observer[1]
  const z = body.positionAu[2] - observer[2]
  const distance = Math.hypot(x, y, z)
  if (distance === 0) return target.set(0, 0, 0)
  const worldScale = band === 'surface' ? 50_000 : band === 'orbital' ? 5_000 : 900
  const renderedDistance = compressedRenderDistance(distance) * worldScale
  return target.set(x, z, -y).normalize().multiplyScalar(renderedDistance)
}

function heliocentricSunDirection(body: CelestialBodyState) {
  return new THREE.Vector3(-body.positionAu[0], -body.positionAu[2], body.positionAu[1]).normalize()
}

const ORBIT_IDS: Exclude<CelestialBodyId, 'sun' | 'moon'>[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']

function FloatingOrbit({ id, observer, band, quality, utcMs }: { id: Exclude<CelestialBodyId, 'sun' | 'moon'>; observer: React.MutableRefObject<AuVector>; band: SpaceBand; quality: Quality; utcMs: number }) {
  const segments = quality === 'desktop' ? 128 : 72
  const epoch = Math.floor(utcMs / (30 * 86_400_000)) * 30 * 86_400_000
  const path = useMemo(() => getPlanetOrbitPath(id, epoch, segments), [epoch, id, segments])
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 3), 3))
    return next
  }, [segments])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const worldScale = band === 'orbital' ? 5_000 : 900
    for (let index = 0; index < path.length; index += 1) {
      const x = path[index][0] - observer.current[0]
      const y = path[index][1] - observer.current[1]
      const z = path[index][2] - observer.current[2]
      const distance = Math.hypot(x, y, z)
      const renderDistance = compressedRenderDistance(distance) * worldScale
      const inverse = distance > 0 ? renderDistance / distance : 0
      positions.setXYZ(index, x * inverse, z * inverse, -y * inverse)
    }
    positions.needsUpdate = true
  })
  return <lineLoop geometry={geometry}><lineBasicMaterial color={id === 'earth' ? '#3c7196' : '#28445f'} transparent opacity={id === 'earth' ? 0.5 : 0.28} /></lineLoop>
}

function FloatingBody({ body, dayMap, observer, band, nearestId, quality, selected, forceLabel = false, sunDirection, utcMs, onSelect }: { body: CelestialBodyState; dayMap: EarthObservationTextures; observer: React.MutableRefObject<AuVector>; band: SpaceBand; nearestId: string; quality: Quality; selected: boolean; forceLabel?: boolean; sunDirection: THREE.Vector3; utcMs: number; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null)
  const visualGroup = useRef<THREE.Group>(null)
  const labelGroup = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const heliocentricLight = useMemo(() => heliocentricSunDirection(body), [body.positionAu[0], body.positionAu[1], body.positionAu[2]])
  const localSunDirection = body.id === 'earth' ? sunDirection : heliocentricLight
  const detailed = selected || body.id === nearestId
  useFrame(() => {
    if (!group.current || !visualGroup.current) return
    planetPosition(body, observer.current, band, target)
    group.current.position.copy(target)
    const distance = Math.hypot(body.positionAu[0] - observer.current[0], body.positionAu[1] - observer.current[1], body.positionAu[2] - observer.current[2])
    const worldScale = band === 'surface' ? 50_000 : band === 'orbital' ? 5_000 : 900
    const trueRadius = body.radiusKm / AU_KM * worldScale
    const markerRadius = body.id === 'sun' ? 0.75 : 0.13 + Math.log10(body.radiusKm / 2_000 + 1) * 0.11
    const radius = detailed && distance < 0.05 ? Math.max(trueRadius, markerRadius * 0.65) : markerRadius
    visualGroup.current.scale.setScalar(radius)
    if (labelGroup.current) labelGroup.current.position.set(radius + 0.38, Math.min(radius * 0.25, 0.45), 0)
  })
  return <group ref={group} onClick={(event) => { event.stopPropagation(); onSelect(body.id) }}>
    {body.id === 'sun' && <pointLight intensity={quality === 'desktop' ? 5.2 : 3.8} distance={240} decay={0.45} color="#fff0c2" />}
    <group ref={visualGroup}>
      {detailed ? <DetailedPlanet body={body} dayMap={dayMap} quality={quality} sunDirection={localSunDirection} utcMs={utcMs} /> : body.id === 'sun' ? <SunVisual detailed={false} quality={quality} /> : <mesh><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color={body.color} roughness={0.9} /></mesh>}
      {selected && band === 'solar' && <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.48, 48]} /><meshBasicMaterial color="#9bdcff" transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>}
    </group>
    {band === 'solar' && (forceLabel || selected || ['sun', 'earth', 'mars', 'jupiter', 'saturn', 'neptune'].includes(body.id)) && <group ref={labelGroup}><Text fontSize={forceLabel ? 0.22 : 0.32} color={selected ? '#ffffff' : forceLabel ? '#d9a36c' : '#9fb7ca'} anchorX="left">{body.label}</Text></group>}
  </group>
}

function FloatingSmallOrbit({ orbit, observer, quality }: { orbit: KeplerOrbit; observer: React.MutableRefObject<AuVector>; quality: Quality }) {
  const count = quality === 'desktop' ? 128 : 72
  const path = useMemo(() => getKeplerOrbitPath(orbit, count), [orbit, count])
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    return next
  }, [count])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    for (let index = 0; index < path.length; index += 1) {
      const x = path[index][0] - observer.current[0], y = path[index][1] - observer.current[1], z = path[index][2] - observer.current[2]
      const distance = Math.hypot(x, y, z)
      const inverse = distance > 0 ? compressedRenderDistance(distance) * 900 / distance : 0
      positions.setXYZ(index, x * inverse, z * inverse, -y * inverse)
    }
    positions.needsUpdate = true
  })
  return <lineLoop geometry={geometry}><lineBasicMaterial color="#9a5c32" transparent opacity={0.28} /></lineLoop>
}

function SmallBodies({ dayMap, observer, band, quality, selectedObjectId, utcMs, onSelect }: { dayMap: EarthObservationTextures; observer: React.MutableRefObject<AuVector>; band: SpaceBand; quality: Quality; selectedObjectId?: string; utcMs: number; onSelect: (id: string) => void }) {
  const julianDay = utcMs / 86_400_000 + 2_440_587.5
  if (band !== 'solar') return null
  return <>{(SMALL_BODIES as SmallBodyRecord[]).map((body, index) => {
    const position = propagateKeplerOrbit(body, julianDay)
    const state = { id: body.id, label: body.label, englishLabel: body.englishLabel, color: '#d77c43', radiusKm: 20, positionAu: position } as CelestialBodyState
    const selected = body.id === selectedObjectId
    return <group key={body.id}><FloatingSmallOrbit orbit={body} observer={observer} quality={quality} /><FloatingBody body={state} dayMap={dayMap} observer={observer} band={band} nearestId="" quality="mobile" selected={selected} forceLabel={selected || index < 3} sunDirection={SMALL_BODY_SUN_DIRECTION} utcMs={utcMs} onSelect={onSelect} /></group>
  })}</>
}

function FlightWorld({ dayMap, navigation, quality, selectedObjectId, showSmallBodies, sunDirection, utcMs, onNavigationChange, onSelect }: { dayMap: EarthObservationTextures; navigation: NavigationState; quality: Quality; selectedObjectId?: string; showSmallBodies: boolean; sunDirection: THREE.Vector3; utcMs: number; onNavigationChange: (state: NavigationState) => void; onSelect: (id: string) => void }) {
  const snapshot = useMemo(() => getSolarSystemSnapshot(utcMs), [utcMs])
  const observer = useRef<AuVector>([...navigation.observerHelioAu])
  const band = useRef<SpaceBand>(navigation.band)
  const keys = useRef(new Set<string>())
  const speedMultiplier = useRef(1)
  const lastReport = useRef(0)
  const { camera, gl } = useThree()
  const navigationRef = useRef(navigation)
  const onNavigationRef = useRef(onNavigationChange)
  const snapshotRef = useRef(snapshot)
  const localMovement = useMemo(() => new THREE.Vector3(), [])
  const turnQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const verticalAxis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const collisionVector = useMemo(() => new THREE.Vector3(), [])
  const mouseEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])
  navigationRef.current = navigation
  onNavigationRef.current = onNavigationChange
  snapshotRef.current = snapshot

  useEffect(() => {
    camera.position.set(0, 0, 0)
    camera.quaternion.set(...navigation.orientation)
    camera.near = 0.001
    camera.far = 500
    camera.updateProjectionMatrix()
  }, [camera])

  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current.add(event.code)
    const up = (event: KeyboardEvent) => keys.current.delete(event.code)
    const blur = () => keys.current.clear()
    const mouse = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      mouseEuler.setFromQuaternion(camera.quaternion, 'YXZ')
      mouseEuler.y -= event.movementX * 0.0018
      mouseEuler.x = THREE.MathUtils.clamp(mouseEuler.x - event.movementY * 0.0018, -Math.PI * 0.49, Math.PI * 0.49)
      camera.quaternion.setFromEuler(mouseEuler)
    }
    const wheel = (event: WheelEvent) => { event.preventDefault(); speedMultiplier.current = THREE.MathUtils.clamp(speedMultiplier.current * Math.exp(-event.deltaY * 0.001), 0.1, 12) }
    const lock = () => { if (!gl.xr.isPresenting && document.pointerLockElement !== gl.domElement) void gl.domElement.requestPointerLock() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); window.addEventListener('mousemove', mouse)
    gl.domElement.addEventListener('wheel', wheel, { passive: false }); gl.domElement.addEventListener('click', lock)
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('mousemove', mouse)
      gl.domElement.removeEventListener('wheel', wheel); gl.domElement.removeEventListener('click', lock)
    }
  }, [camera, gl, mouseEuler])

  useFrame((_, delta) => {
    const closest = nearestBody(observer.current, snapshot)
    band.current = selectSpaceBand(closest.distanceAu)
    const baseSpeed = adaptiveFlightSpeed(closest.distanceAu)
    let moved = false
    const local = localMovement.set(
        Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA')),
        Number(keys.current.has('KeyE')) - Number(keys.current.has('KeyQ')),
        Number(keys.current.has('KeyS')) - Number(keys.current.has('KeyW')),
      )
      const session = gl.xr.getSession()
      if (session) for (const source of session.inputSources) {
        const axes = source.gamepad?.axes
        if (!axes) continue
        if (source.handedness === 'left') { local.x += axes[2] ?? 0; local.z += axes[3] ?? 0 }
        if (source.handedness === 'right') {
          const yaw = -(axes[2] ?? 0) * delta * 1.25
          camera.quaternion.premultiply(turnQuaternion.setFromAxisAngle(verticalAxis, yaw))
          local.y -= axes[3] ?? 0
          if (source.gamepad?.buttons[0]?.pressed) speedMultiplier.current = Math.min(12, speedMultiplier.current * (1 + delta * 1.6))
          if (source.gamepad?.buttons[1]?.pressed) speedMultiplier.current = Math.max(0.1, speedMultiplier.current * (1 - delta * 1.8))
        }
      }
    if (local.lengthSq() > 0.0001) {
      local.normalize().applyQuaternion(camera.quaternion)
      const boost = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight') ? 5 : 1
      const step = baseSpeed * speedMultiplier.current * boost * delta
      observer.current[0] += local.x * step
      observer.current[1] += -local.z * step
      observer.current[2] += local.y * step
      moved = true
    }
    const afterMove = nearestBody(observer.current, snapshot)
    const minimum = afterMove.radiusKm / AU_KM * 1.05
    if (afterMove.distanceAu < minimum) {
      const away = collisionVector.set(observer.current[0] - afterMove.positionAu[0], observer.current[1] - afterMove.positionAu[1], observer.current[2] - afterMove.positionAu[2]).normalize().multiplyScalar(minimum)
      observer.current = [afterMove.positionAu[0] + away.x, afterMove.positionAu[1] + away.y, afterMove.positionAu[2] + away.z]
    }
    if (moved || performance.now() - lastReport.current > 180) {
      if (performance.now() - lastReport.current > 90) {
        lastReport.current = performance.now()
        onNavigationRef.current({ controlMode: 'flight', observerHelioAu: [...observer.current], orientation: camera.quaternion.toArray() as [number, number, number, number], speedAuPerSecond: baseSpeed * speedMultiplier.current, band: band.current })
      }
    }
  })

  const closest = nearestBody(navigation.observerHelioAu, snapshot)
  return <>
    {navigation.band !== 'surface' && ORBIT_IDS.map((id) => <FloatingOrbit key={id} id={id} observer={observer} band={navigation.band} quality={quality} utcMs={utcMs} />)}
    {snapshot.map((body) => <FloatingBody key={body.id} body={body} dayMap={dayMap} observer={observer} band={navigation.band} nearestId={closest.id} quality={quality} selected={body.id === selectedObjectId} sunDirection={sunDirection} utcMs={utcMs} onSelect={onSelect} />)}
    {showSmallBodies && <SmallBodies dayMap={dayMap} observer={observer} band={navigation.band} quality={quality} selectedObjectId={selectedObjectId} utcMs={utcMs} onSelect={onSelect} />}
  </>
}

function VRPresetMenu({ onPresetChange }: { onPresetChange: (preset: CameraPresetId) => void }) {
  const { gl } = useThree()
  const [presenting, setPresenting] = useState(gl.xr.isPresenting)
  useEffect(() => {
    const update = () => setPresenting(gl.xr.isPresenting)
    gl.xr.addEventListener('sessionstart', update); gl.xr.addEventListener('sessionend', update)
    return () => { gl.xr.removeEventListener('sessionstart', update); gl.xr.removeEventListener('sessionend', update) }
  }, [gl])
  if (!presenting) return null
  return <group position={[0, 3.8, -1.4]}>{CAMERA_PRESETS.map((preset, index) => <group key={preset.id} position={[(index - 2) * 1.05, 0, -Math.abs(index - 2) * 0.2]} onClick={(event) => { event.stopPropagation(); onPresetChange(preset.id) }}>
    <mesh><planeGeometry args={[0.92, 0.34]} /><meshBasicMaterial color="#0a1b2d" transparent opacity={0.9} /></mesh>
    <Text fontSize={0.095} color="#dbeeff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>{preset.label}</Text>
  </group>)}</group>
}

export function Scene({ annotations, navigation, preset, quality, selectedObjectId, targetPositionAu, targetDistanceLabel, showSmallBodies, frameP95Ms, utcMs, onNavigationChange, onObservationStatus, onPresetChange, onSelect, onSkyReady, onTargetIndicator }: Props) {
  const closeView = navigation.controlMode === 'flight' ? navigation.band === 'surface' : preset === 'atmosphere' || preset === 'clouds' || preset === 'china'
  const dayMap = useEarthObservationTexture(utcMs, quality, closeView, frameP95Ms, onObservationStatus)
  const sunDirection = useMemo(() => new THREE.Vector3(...getEarthFixedSunDirection(utcMs)), [utcMs])
  const indicatorObserver = useMemo<AuVector>(() => {
    if (navigation.controlMode === 'flight') return navigation.observerHelioAu
    return getSolarSystemSnapshot(utcMs).find((body) => body.id === 'earth')!.positionAu
  }, [navigation.controlMode, navigation.observerHelioAu, utcMs])
  useEffect(() => { document.title = '地球与太阳系观察 / Live Earth & Solar System' }, [])
  return <>
    <color attach="background" args={['#010207']} />
    <ambientLight intensity={0.08} color="#b8cae0" />
    <directionalLight position={sunDirection.clone().multiplyScalar(80)} intensity={3.2} color="#fff7df" />
    <StarCatalog onReady={onSkyReady} quality={quality} />
    {selectedObjectId && targetPositionAu && targetDistanceLabel && <TargetTracker objectId={selectedObjectId} positionAu={targetPositionAu} observerAu={indicatorObserver} distanceLabel={targetDistanceLabel} onChange={onTargetIndicator} />}
    {navigation.controlMode === 'orbit'
      ? <OrbitEarth annotations={annotations} dayMap={dayMap} preset={preset} quality={quality} sunDirection={sunDirection} utcMs={utcMs} />
      : <FlightWorld dayMap={dayMap} navigation={navigation} quality={quality} selectedObjectId={selectedObjectId} showSmallBodies={showSmallBodies} sunDirection={sunDirection} utcMs={utcMs} onNavigationChange={onNavigationChange} onSelect={onSelect} />}
    <VRPresetMenu onPresetChange={onPresetChange} />
  </>
}
