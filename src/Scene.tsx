import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls, Text, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { IfInSessionMode, XRSpace } from '@react-three/xr'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { getMoonOrbitPath, getPlanetOrbitPath, getSolarSystemSnapshot, type CelestialBodyId, type CelestialBodyState } from './astro'
import { EARTH_AXIAL_TILT_RAD, earthRotationAngleRad, getEarthInertialSunDirection } from './earthOrientation'
import { buildGibsWmsUrl, chooseEarthImagery, disposeReplacedTextures, estimateImageCoverage, getEarthResolutionFallbacks, getImageryBlendFrames, selectEarthResolution, type EarthImageryRequest, type EarthResolution } from './earthImagery'
import { adaptiveFlightSpeed, compressedRenderDistance, nearestBody, selectSpaceBand, type AuVector, type NavigationState, type SpaceBand } from './navigation'
import { getKeplerOrbitPath, type KeplerOrbit } from './orbits'
import { frameSimulationUtcMs, poleDirectionThree, spinAngleRad, writeSmallBodyRenderPosition } from './smallBodyMotion'
import { SMALL_BODIES, type SmallBodyRecord, type SmallBodyShapeModel } from './smallBodies'

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
  loading: boolean
  resolution: EarthResolution['label']
}

type Props = {
  annotations: boolean
  navigation: NavigationState
  preset: CameraPresetId
  quality: Quality
  selectedObjectId?: string
  imageryRequest?: EarthImageryRequest
  showSmallBodies: boolean
  frameP95Ms: number | null
  paused: boolean
  rate: number
  utcMs: number
  onNavigationChange: (state: NavigationState) => void
  onObservationStatus: (status: EarthObservationStatus) => void
  onSelect: (id: string) => void
  onSkyReady: () => void
}

const AU_KM = 149_597_870.7
const J2000_MS = Date.UTC(2000, 0, 1, 12)
const DAY_MAP = `${import.meta.env.BASE_URL}assets/earth-blue-marble-5k.jpg`
const NASA_SNAPSHOT_MAP = `${import.meta.env.BASE_URL}assets/earth-nasa-viirs-2026-08-15-4k.jpg`
const NASA_SNAPSHOT_DATE = '2026-08-15'
const NIGHT_MAP = `${import.meta.env.BASE_URL}assets/earth-night.png`
const OCEAN_MASK = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`
const SUN_MAP = `${import.meta.env.BASE_URL}assets/sun-real.jpg`
const STAR_CATALOG = `${import.meta.env.BASE_URL}assets/stars/hyg-bright-stars.bin`
const DEFAULT_ATMOSPHERE_SUN_DIRECTION = new THREE.Vector3(1, 0.2, 0.4).normalize()
const SMALL_BODY_MODELS: Record<SmallBodyShapeModel, string> = {
  ceres: `${import.meta.env.BASE_URL}assets/small-bodies/ceres.glb`,
  vesta: `${import.meta.env.BASE_URL}assets/small-bodies/vesta.glb`,
  eros: `${import.meta.env.BASE_URL}assets/small-bodies/eros.glb`,
  bennu: `${import.meta.env.BASE_URL}assets/small-bodies/bennu.glb`,
}

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

function useEarthObservationTexture(imageryRequest: EarthImageryRequest | undefined, quality: Quality, closeView: boolean, frameP95Ms: number | null, onStatus: (status: EarthObservationStatus) => void) {
  const fallback = useTexture(DAY_MAP, quality)
  const snapshot = useTexture(NASA_SNAPSHOT_MAP, quality)
  const { gl } = useThree()
  const resolution = selectEarthResolution({ quality, closeView, maxTextureSize: gl.capabilities.maxTextureSize, deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, frameP95Ms })
  const resolutionRef = useRef(resolution)
  resolutionRef.current = resolution
  const requestId = imageryRequest?.id
  const requestUtcMs = imageryRequest?.utcMs
  const frames = getImageryBlendFrames(requestUtcMs ?? Date.parse(`${NASA_SNAPSHOT_DATE}T12:00:00.000Z`))
  const [textures, setTextures] = useState<EarthObservationTextures>({ base: fallback, primary: snapshot, secondary: snapshot, mix: 0, resolution })
  const owned = useRef<THREE.Texture[]>([])

  useEffect(() => {
    let cancelled = false
    let retireTimer: number | undefined
    const requestedResolution = resolutionRef.current
    const useSnapshot = (label: string) => {
      if (cancelled) return
      const previous = owned.current
      owned.current = []
      setTextures({ base: fallback, primary: snapshot, secondary: snapshot, mix: 0, resolution: requestedResolution })
      onStatus({ source: 'NASA GIBS · VIIRS/Suomi NPP · 预存', label: `${label} · 4K`, date: NASA_SNAPSHOT_DATE, fallback: true, loading: false, resolution: '4K' })
      if (previous.length) retireTimer = window.setTimeout(() => disposeReplacedTextures(previous), 1_500)
    }
    const load = async () => {
      if (requestId == null || requestUtcMs == null) {
        useSnapshot(`${NASA_SNAPSHOT_DATE} 预存 NASA VIIRS 真彩`)
        return
      }
      const choice = chooseEarthImagery(requestUtcMs)
      if (choice.kind === 'fallback') {
        useSnapshot('无可用卫星观测 · 保留预存 NASA 快照')
        return
      }
      onStatus({ source: 'NASA GIBS', label: choice.kind === 'recent' ? `正在寻找最新完整卫星观测 · ${requestedResolution.label}…` : `正在加载 ${choice.date} 卫星观测 · ${requestedResolution.label}…`, fallback: false, loading: true, resolution: requestedResolution.label })
      try {
        let date: string | undefined
        if (choice.kind === 'recent') {
          for (const candidate of choice.dates) {
            if (await probeCoverage(choice.layer, candidate) >= 0.55) { date = candidate; break }
          }
        } else if (await probeCoverage(choice.layer, choice.date) >= 0.08) date = choice.date
        if (!date) throw new Error('No useful coverage')
        let actualResolution = requestedResolution
        let primaryImage: HTMLImageElement | undefined
        for (const candidate of getEarthResolutionFallbacks(requestedResolution)) {
          try {
            primaryImage = await loadImage(buildGibsWmsUrl(choice.layer, date, candidate.width, candidate.height))
            actualResolution = candidate
            break
          } catch {
            // Retry a failed 8K request at 4K before restoring the bundled snapshot.
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
        onStatus({ source: choice.layer.startsWith('VIIRS') ? 'NASA GIBS · VIIRS/Suomi NPP' : 'NASA GIBS · MODIS/Terra', label: `${choice.kind === 'recent' ? `${date} 近实时卫星真彩 · 约 ${Math.round(delayHours)} 小时延迟` : `${date} 历史卫星真彩`} · ${actualResolution.label} · 真彩图含实测云层`, date, fallback: false, loading: false, resolution: actualResolution.label })
        if (previous.length) retireTimer = window.setTimeout(() => disposeReplacedTextures(previous), 1_500)
      } catch {
        useSnapshot('NASA GIBS 暂不可用 · 保留预存 NASA 快照')
      }
    }
    void load()
    return () => { cancelled = true; if (retireTimer) window.clearTimeout(retireTimer) }
  }, [fallback, frames.primaryDate, frames.secondaryDate, onStatus, quality, requestId, requestUtcMs, snapshot])

  useEffect(() => () => disposeReplacedTextures(owned.current), [])
  return { ...textures, mix: textures.secondary === textures.primary ? 0 : frames.mix }
}

function Atmosphere({ radius, segments, quality, sunDirection = DEFAULT_ATMOSPHERE_SUN_DIRECTION, color = '#3b92ff' }: { radius: number; segments: number; quality: Quality; sunDirection?: THREE.Vector3; color?: string }) {
  const outerRadius = radius * 1.025
  const sampleCount = quality === 'desktop' ? 3 : 2
  const uniforms = useMemo(() => ({
    atmosphereColor: { value: new THREE.Color(color) },
    sunDirection: { value: sunDirection.clone() },
    innerRadius: { value: radius },
    outerRadius: { value: outerRadius },
  }), [color, outerRadius, radius])
  useFrame(() => { uniforms.sunDirection.value.copy(sunDirection) })
  return <mesh renderOrder={4}>
    <sphereGeometry args={[outerRadius, Math.min(segments, 96), Math.min(segments, 72)]} />
    <shaderMaterial transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} uniforms={uniforms} vertexShader={`
      uniform float innerRadius; uniform float outerRadius;
      varying vec3 vWorldPosition; varying vec3 vWorldCenter; varying float vInnerRadius; varying float vOuterRadius;
      void main(){
        vec4 worldPosition=modelMatrix*vec4(position,1.0);
        vWorldPosition=worldPosition.xyz;
        vWorldCenter=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        float worldScale=length((modelMatrix*vec4(1.0,0.0,0.0,0.0)).xyz);
        vInnerRadius=innerRadius*worldScale;
        vOuterRadius=outerRadius*worldScale;
        gl_Position=projectionMatrix*viewMatrix*worldPosition;
      }
    `} fragmentShader={`
      uniform vec3 atmosphereColor; uniform vec3 sunDirection;
      varying vec3 vWorldPosition; varying vec3 vWorldCenter; varying float vInnerRadius; varying float vOuterRadius;
      vec2 raySphereIntersection(vec3 origin,vec3 direction,vec3 center,float sphereRadius){
        vec3 offset=origin-center;
        float projection=dot(offset,direction);
        float discriminant=projection*projection-dot(offset,offset)+sphereRadius*sphereRadius;
        if(discriminant<=0.0)return vec2(-1.0);
        float root=sqrt(discriminant);
        return vec2(-projection-root,-projection+root);
      }
      float sampleDensity(float sampleRadius,float innerRadius,float outerRadius){
        float normalizedHeight=clamp((sampleRadius-innerRadius)/(outerRadius-innerRadius),0.0,1.0);
        return exp(-normalizedHeight*6.0);
      }
      void main(){
        vec3 rayDirection=normalize(vWorldPosition-cameraPosition);
        vec3 lightDirection=normalize(sunDirection);
        vec2 outerHit=raySphereIntersection(cameraPosition,rayDirection,vWorldCenter,vOuterRadius);
        vec2 innerHit=raySphereIntersection(cameraPosition,rayDirection,vWorldCenter,vInnerRadius);
        float entry=max(outerHit.x,0.0);
        float exitDistance=outerHit.y;
        if(innerHit.x>entry)exitDistance=min(exitDistance,innerHit.x);
        float pathLength=max(exitDistance-entry,0.0);
        vec3 midpointOffset=cameraPosition+rayDirection*(entry+pathLength*0.5)-vWorldCenter;
        if(dot(normalize(midpointOffset),lightDirection)<-0.12){
          gl_FragColor=vec4(0.0);
          return;
        }
        float stepLength=pathLength/${sampleCount.toFixed(1)};
        float accumulatedDensity=0.0;
        float accumulatedSunset=0.0;
        for(int index=0;index<${sampleCount};index++){
          float fraction=(float(index)+0.5)/${sampleCount.toFixed(1)};
          vec3 samplePosition=cameraPosition+rayDirection*(entry+pathLength*fraction);
          vec3 sampleOffset=samplePosition-vWorldCenter;
          float sampleRadius=length(sampleOffset);
          float density=sampleDensity(sampleRadius,vInnerRadius,vOuterRadius);
          vec3 sampleNormal=sampleOffset/max(sampleRadius,0.00001);
          float solarAltitude=dot(sampleNormal,lightDirection);
          float sunlight=smoothstep(-0.09,0.12,solarAltitude);
          float sunsetBand=smoothstep(-0.08,-0.01,solarAltitude)*(1.0-smoothstep(-0.01,0.07,solarAltitude));
          accumulatedDensity+=density*sunlight;
          accumulatedSunset+=density*sunsetBand;
        }
        float shellThickness=max(vOuterRadius-vInnerRadius,0.00001);
        float opticalDepth=1.0-exp(-accumulatedDensity*stepLength/(shellThickness*2.2));
        float sunsetDepth=1.0-exp(-accumulatedSunset*stepLength/(shellThickness*2.8));
        float scatteringCosine=dot(rayDirection,lightDirection);
        float rayleighPhase=0.72+0.28*scatteringCosine*scatteringCosine;
        float rayleighStrength=opticalDepth*rayleighPhase;
        float forwardScatter=max(scatteringCosine,0.0);
        float forwardSquared=forwardScatter*forwardScatter;
        float forwardFourth=forwardSquared*forwardSquared;
        float forwardEighth=forwardFourth*forwardFourth;
        forwardScatter=forwardEighth*forwardEighth*forwardSquared;
        float mieStrength=opticalDepth*forwardScatter*0.12;
        float sunsetWarmth=sunsetDepth;
        vec3 rayleighColor=atmosphereColor*rayleighPhase;
        vec3 mieColor=vec3(1.0,0.78,0.5)*forwardScatter*0.1;
        vec3 scatteringColor=mix(rayleighColor+mieColor,vec3(1.0,0.26,0.04),clamp(sunsetWarmth*0.5,0.0,0.28));
        float alpha=clamp(rayleighStrength*0.55+mieStrength*0.24+sunsetWarmth*0.12,0.0,0.56);
        gl_FragColor=vec4(scatteringColor,alpha);
      }
    `} />
  </mesh>
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
        float brightnessA=max(observedA.r,max(observedA.g,observedA.b));
        float brightnessB=max(observedB.r,max(observedB.g,observedB.b));
        float southPolarWeight=1.0-smoothstep(0.0,0.1667,vUv.y);
        float globalCoverageA=smoothstep(0.015,0.065,brightnessA);
        float globalCoverageB=smoothstep(0.015,0.065,brightnessB);
        float polarCoverageA=smoothstep(0.055,0.14,brightnessA);
        float polarCoverageB=smoothstep(0.055,0.14,brightnessB);
        float coverageA=mix(globalCoverageA,polarCoverageA,southPolarWeight);
        float coverageB=mix(globalCoverageB,polarCoverageB,southPolarWeight);
        vec3 dayA=mix(base,observedA,coverageA);
        vec3 dayB=mix(base,observedB,coverageB);
        vec3 day=mix(dayA,dayB,dayMix);
        vec3 night=texture2D(nightMap,vUv).rgb;
        float polarGap=southPolarWeight*(1.0-mix(polarCoverageA,polarCoverageB,dayMix));
        vec3 polarNightBase=mix(night*0.65,base*0.14,polarGap*0.72);
        float ocean=texture2D(oceanMask,vUv).r;
        vec3 lit=day*(0.18+0.92*max(lightDot,0.0));
        lit+=vec3(0.05,0.12,0.22)*pow(max(lightDot,0.0),22.0)*ocean;
        gl_FragColor=vec4(mix(polarNightBase,lit,daylight),1.0);
      }
    `} />
  </mesh>
}

function EarthGlobe({ baseMap, dayMaps, dayMix, paused, quality, radius, rate, sunDirection, utcMs }: { baseMap: THREE.Texture; dayMaps: [THREE.Texture, THREE.Texture]; dayMix: number; paused: boolean; quality: Quality; radius: number; rate: number; sunDirection: THREE.Vector3; utcMs: number }) {
  const night = useTexture(NIGHT_MAP, quality)
  const ocean = useTexture(OCEAN_MASK, quality, THREE.NoColorSpace)
  const segments = quality === 'desktop' ? 128 : 72
  const spin = useRef<THREE.Group>(null)
  const anchor = useRef({ utcMs, realMs: performance.now(), rate, paused })
  anchor.current = { utcMs, realMs: performance.now(), rate, paused }
  useFrame(() => {
    if (!spin.current) return
    const frameUtcMs = frameSimulationUtcMs(anchor.current.utcMs, anchor.current.realMs, performance.now(), anchor.current.rate, anchor.current.paused)
    spin.current.rotation.y = earthRotationAngleRad(frameUtcMs)
  })
  return <group>
    <group rotation={[EARTH_AXIAL_TILT_RAD, 0, 0]}>
      <group ref={spin} rotation={[0, earthRotationAngleRad(utcMs), 0]}>
        <EarthSurface baseMap={baseMap} dayMaps={dayMaps} dayMix={dayMix} nightMap={night} oceanMask={ocean} radius={radius} segments={segments} sunDirection={sunDirection} />
      </group>
    </group>
    <Atmosphere radius={radius} segments={segments} quality={quality} sunDirection={sunDirection} />
  </group>
}

function AstronomicalLighting({ paused, rate, sunDirection, utcMs }: { paused: boolean; rate: number; sunDirection: THREE.Vector3; utcMs: number }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const anchor = useRef({ utcMs, realMs: performance.now(), rate, paused })
  anchor.current = { utcMs, realMs: performance.now(), rate, paused }
  useFrame(() => {
    const frameUtcMs = frameSimulationUtcMs(anchor.current.utcMs, anchor.current.realMs, performance.now(), anchor.current.rate, anchor.current.paused)
    sunDirection.set(...getEarthInertialSunDirection(frameUtcMs))
    light.current?.position.copy(sunDirection).multiplyScalar(80)
  })
  return <directionalLight ref={light} position={sunDirection.clone().multiplyScalar(80)} intensity={3.2} color="#fff7df" />
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

function OrbitEarth({ annotations, dayMap, paused, preset, quality, rate, selectedObjectId, showSmallBodies, sunDirection, utcMs, onSelect }: { annotations: boolean; dayMap: EarthObservationTextures; paused: boolean; preset: CameraPresetId; quality: Quality; rate: number; selectedObjectId?: string; showSmallBodies: boolean; sunDirection: THREE.Vector3; utcMs: number; onSelect: (id: string) => void }) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const sunMarker = useRef<THREE.Group>(null)
  const motion = useRef<Motion>({ active: false, target: new THREE.Vector3(...CAMERA_PRESETS[0].position), duration: 1.5 })
  const [solarContextVisible, setSolarContextVisible] = useState(false)
  const solarContextVisibleRef = useRef(false)
  const moonMap = useTexture(MOON_MAP, quality)
  const moonScale = 28.3 / 0.00257
  const moonEpoch = Math.floor(utcMs / 86_400_000) * 86_400_000
  const snapshot = useMemo(() => getSolarSystemSnapshot(utcMs), [utcMs])
  const earth = snapshot.find((body) => body.id === 'earth')!
  const solarObserver = useRef<AuVector>([...earth.positionAu])
  solarObserver.current = [...earth.positionAu]
  const moonOrbitGeometry = useMemo(() => {
    const points = getMoonOrbitPath(moonEpoch, quality === 'desktop' ? 160 : 96).map((point) => new THREE.Vector3(point[0], point[2], -point[1]).multiplyScalar(moonScale))
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [moonEpoch, quality])
  useEffect(() => () => moonOrbitGeometry.dispose(), [moonOrbitGeometry])
  const moonPosition = useMemo(() => {
    const earth = snapshot.find((body) => body.id === 'earth')!
    const moon = snapshot.find((body) => body.id === 'moon')!
    return new THREE.Vector3(moon.positionAu[0] - earth.positionAu[0], moon.positionAu[2] - earth.positionAu[2], earth.positionAu[1] - moon.positionAu[1]).multiplyScalar(moonScale)
  }, [snapshot, moonScale])
  useFrame(({ camera }) => {
    sunMarker.current?.position.copy(sunDirection).multiplyScalar(42)
    const visible = camera.position.length() >= 14
    if (visible !== solarContextVisibleRef.current) {
      solarContextVisibleRef.current = visible
      setSolarContextVisible(visible)
    }
  })
  return <>
    <EarthGlobe baseMap={dayMap.base} dayMaps={[dayMap.primary, dayMap.secondary]} dayMix={dayMap.mix} paused={paused} quality={quality} radius={2.25} rate={rate} sunDirection={sunDirection} utcMs={utcMs} />
    <lineLoop geometry={moonOrbitGeometry}><lineBasicMaterial color="#8eb6d2" transparent opacity={0.3} /></lineLoop>
    <mesh position={moonPosition}><sphereGeometry args={[0.58, quality === 'desktop' ? 64 : 36, quality === 'desktop' ? 64 : 36]} /><meshStandardMaterial map={moonMap} roughness={1} /></mesh>
    <group ref={sunMarker} position={sunDirection.clone().multiplyScalar(42)} scale={1.25}><SunVisual detailed={false} quality={quality} />{annotations && <Text position={[0, 1.44, 0]} fontSize={0.144} color="#ffdca0">太阳方向示意</Text>}</group>
    {annotations && <><Text position={[0, 2.75, 0]} fontSize={0.18} color="#d9efff">NASA 近实时真彩地球</Text><Text position={[moonPosition.x, moonPosition.y + 0.9, moonPosition.z]} fontSize={0.16} color="#d9efff">月球 · 真实轨道方向</Text></>}
    {showSmallBodies && solarContextVisible ? <SmallBodies band="solar" observer={solarObserver} paused={paused} quality={quality} rate={rate} selectedObjectId={selectedObjectId} utcMs={utcMs} onSelect={onSelect} /> : null}
    <CameraDirector preset={preset} controls={controls} motion={motion} />
    <IfInSessionMode deny="immersive-vr">
      <OrbitControls ref={controls} enableDamping dampingFactor={0.06} minDistance={2.72} maxDistance={60} target={[0, 0, 0]} onStart={() => { motion.current.active = false }} />
    </IfInSessionMode>
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
    {visual?.atmosphere && <Atmosphere radius={1} segments={quality === 'desktop' ? 64 : 32} quality={quality} color={visual.atmosphere} sunDirection={sunDirection} />}
    {visual?.rings && <RingSystem kind={visual.rings} />}
  </group>
}

function DetailedPlanet({ body, dayMap, paused, quality, rate, sunDirection, utcMs }: { body: CelestialBodyState; dayMap: EarthObservationTextures; paused: boolean; quality: Quality; rate: number; sunDirection: THREE.Vector3; utcMs: number }) {
  if (body.id === 'earth') return <EarthGlobe baseMap={dayMap.base} dayMaps={[dayMap.primary, dayMap.secondary]} dayMix={dayMap.mix} paused={paused} quality={quality} radius={1} rate={rate} sunDirection={sunDirection} utcMs={utcMs} />
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

function FloatingBody({ body, dayMap, observer, band, nearestId, paused, quality, rate, selected, forceLabel = false, sunDirection, utcMs, onSelect }: { body: CelestialBodyState; dayMap: EarthObservationTextures; observer: React.MutableRefObject<AuVector>; band: SpaceBand; nearestId: string; paused: boolean; quality: Quality; rate: number; selected: boolean; forceLabel?: boolean; sunDirection: THREE.Vector3; utcMs: number; onSelect: (id: string) => void }) {
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
      {detailed ? <DetailedPlanet body={body} dayMap={dayMap} paused={paused} quality={quality} rate={rate} sunDirection={localSunDirection} utcMs={utcMs} /> : body.id === 'sun' ? <SunVisual detailed={false} quality={quality} /> : <mesh><sphereGeometry args={[1, 24, 18]} /><meshStandardMaterial color={body.color} roughness={0.9} /></mesh>}
      {selected && band === 'solar' && <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.48, 48]} /><meshBasicMaterial color="#9bdcff" transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>}
    </group>
    {forceLabel && <mesh><sphereGeometry args={[0.32, 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
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

function smallBodySeed(id: string) {
  let value = 2166136261
  for (let index = 0; index < id.length; index += 1) value = Math.imul(value ^ id.charCodeAt(index), 16777619)
  return value >>> 0
}

function ProceduralRock({ body, quality }: { body: SmallBodyRecord; quality: Quality }) {
  const geometry = useMemo(() => {
    const next = new THREE.IcosahedronGeometry(1, quality === 'desktop' ? 2 : 1).toNonIndexed()
    const positions = next.getAttribute('position') as THREE.BufferAttribute
    const seed = smallBodySeed(body.id)
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index)
      const length = Math.hypot(x, y, z) || 1
      const nx = x / length, ny = y / length, nz = z / length
      const largeScale = Math.sin(nx * 5.7 + seed * 0.000013) * Math.sin(ny * 7.1 - seed * 0.000017)
      const smallScale = Math.sin((nx + ny + nz) * 19.0 + seed * 0.000031)
      const roughness = 0.9 + largeScale * 0.115 + smallScale * 0.045
      positions.setXYZ(index, nx * roughness * body.axisRatios[0], ny * roughness * body.axisRatios[1], nz * roughness * body.axisRatios[2])
    }
    next.computeVertexNormals()
    return next
  }, [body, quality])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}><meshStandardMaterial color={body.shapeModel ? '#8a8174' : '#6f6255'} roughness={0.96} metalness={0.02} flatShading /></mesh>
}

function SmallBodyVisual({ body, quality, selected }: { body: SmallBodyRecord; quality: Quality; selected: boolean }) {
  const fallback = <ProceduralRock body={body} quality={quality} />
  if (!selected || !body.shapeModel) return fallback
  return <Suspense fallback={fallback}><NasaModel url={SMALL_BODY_MODELS[body.shapeModel]} /></Suspense>
}

function SmallBodyObject({ body, observer, paused, quality, rate, selected, utcMs, onSelect }: { body: SmallBodyRecord; observer: React.MutableRefObject<AuVector>; paused: boolean; quality: Quality; rate: number; selected: boolean; utcMs: number; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null)
  const visual = useRef<THREE.Group>(null)
  const spinner = useRef<THREE.Group>(null)
  const anchor = useRef({ utcMs, realMs: performance.now(), paused, rate })
  if (anchor.current.utcMs !== utcMs || anchor.current.paused !== paused || anchor.current.rate !== rate) anchor.current = { utcMs, realMs: performance.now(), paused, rate }
  const poleQuaternion = useMemo(() => {
    const direction = new THREE.Vector3(...poleDirectionThree(body.poleRaDeg, body.poleDecDeg))
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  }, [body.poleDecDeg, body.poleRaDeg])
  const markerRadius = selected ? 0.34 : 0.17

  useFrame(() => {
    if (!group.current || !visual.current || !spinner.current) return
    const frameUtcMs = frameSimulationUtcMs(anchor.current.utcMs, anchor.current.realMs, performance.now(), anchor.current.rate, anchor.current.paused)
    writeSmallBodyRenderPosition(body, observer.current, frameUtcMs, group.current.position)
    spinner.current.rotation.y = spinAngleRad(frameUtcMs, body.rotationPeriodHours)
    visual.current.scale.setScalar(markerRadius)
  })

  return <group ref={group} onClick={(event) => { event.stopPropagation(); onSelect(body.id) }}>
    <group ref={visual}>
      <group quaternion={poleQuaternion}><group ref={spinner}><SmallBodyVisual body={body} quality={quality} selected={selected} /></group></group>
      {selected && <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.28, 1.48, 40]} /><meshBasicMaterial color="#ffd2a0" transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>}
    </group>
    <mesh><sphereGeometry args={[0.38, 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <Text position={[markerRadius + 0.32, markerRadius * 0.25, 0]} fontSize={0.22} color={selected ? '#ffffff' : '#d9a36c'} anchorX="left">{body.label}</Text>
  </group>
}

function SmallBodies({ band, observer, paused, quality, rate, selectedObjectId, utcMs, onSelect }: { band: SpaceBand; observer: React.MutableRefObject<AuVector>; paused: boolean; quality: Quality; rate: number; selectedObjectId?: string; utcMs: number; onSelect: (id: string) => void }) {
  if (band !== 'solar') return null
  return <>{(SMALL_BODIES as SmallBodyRecord[]).map((body) => <group key={body.id}>
    <FloatingSmallOrbit orbit={body} observer={observer} quality={quality} />
    <SmallBodyObject body={body} observer={observer} paused={paused} quality={quality} rate={rate} selected={body.id === selectedObjectId} utcMs={utcMs} onSelect={onSelect} />
  </group>)}</>
}

function FlightWorld({ dayMap, navigation, paused, quality, rate, selectedObjectId, showSmallBodies, sunDirection, utcMs, onNavigationChange, onSelect }: { dayMap: EarthObservationTextures; navigation: NavigationState; paused: boolean; quality: Quality; rate: number; selectedObjectId?: string; showSmallBodies: boolean; sunDirection: THREE.Vector3; utcMs: number; onNavigationChange: (state: NavigationState) => void; onSelect: (id: string) => void }) {
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
    {snapshot.map((body) => <FloatingBody key={body.id} body={body} dayMap={dayMap} observer={observer} band={navigation.band} nearestId={closest.id} paused={paused} quality={quality} rate={rate} selected={body.id === selectedObjectId} sunDirection={sunDirection} utcMs={utcMs} onSelect={onSelect} />)}
    {showSmallBodies && <SmallBodies band={navigation.band} observer={observer} paused={paused} quality={quality} rate={rate} selectedObjectId={selectedObjectId} utcMs={utcMs} onSelect={onSelect} />}
  </>
}

export function VRPresetMenu({ controlMode, onControlModeChange, onPresetChange }: { controlMode: NavigationState['controlMode']; onControlModeChange: (mode: NavigationState['controlMode']) => void; onPresetChange: (preset: CameraPresetId) => void }) {
  return <IfInSessionMode allow="immersive-vr"><XRSpace space="viewer"><group position={[0, -0.45, -1.4]}>{CAMERA_PRESETS.map((preset, index) => <group key={preset.id} position={[(index - 2) * 1.05, 0, -Math.abs(index - 2) * 0.2]} onClick={(event) => { event.stopPropagation(); onPresetChange(preset.id) }}>
    <mesh><planeGeometry args={[0.92, 0.34]} /><meshBasicMaterial color="#0a1b2d" transparent opacity={0.9} /></mesh>
    <Text fontSize={0.095} color="#dbeeff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>{preset.label}</Text>
  </group>)}<group position={[0, -0.52, 0]} onClick={(event) => { event.stopPropagation(); onControlModeChange(controlMode === 'flight' ? 'orbit' : 'flight') }}>
    <mesh><planeGeometry args={[1.45, 0.36]} /><meshBasicMaterial color={controlMode === 'flight' ? '#235b78' : '#0a1b2d'} transparent opacity={0.94} /></mesh>
    <Text fontSize={0.105} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>{controlMode === 'flight' ? '退出自由飞行' : '自由飞行'}</Text>
  </group></group></XRSpace></IfInSessionMode>
}

export function Scene({ annotations, navigation, paused, preset, quality, rate, selectedObjectId, imageryRequest, showSmallBodies, frameP95Ms, utcMs, onNavigationChange, onObservationStatus, onSelect, onSkyReady }: Props) {
  const closeView = navigation.controlMode === 'flight' ? navigation.band === 'surface' : preset === 'atmosphere' || preset === 'clouds' || preset === 'china'
  const dayMap = useEarthObservationTexture(imageryRequest, quality, closeView, frameP95Ms, onObservationStatus)
  const sunDirection = useMemo(() => new THREE.Vector3(...getEarthInertialSunDirection(utcMs)), [])
  useEffect(() => { document.title = '地球与太阳系观察 / Live Earth & Solar System' }, [])
  return <>
    <color attach="background" args={['#010207']} />
    <mesh><sphereGeometry args={[320, 32, 16]} /><meshBasicMaterial color="#010207" side={THREE.BackSide} /></mesh>
    <ambientLight intensity={0.08} color="#b8cae0" />
    <AstronomicalLighting paused={paused} rate={rate} sunDirection={sunDirection} utcMs={utcMs} />
    <StarCatalog onReady={onSkyReady} quality={quality} />
    {navigation.controlMode === 'orbit'
      ? <OrbitEarth annotations={annotations} dayMap={dayMap} paused={paused} preset={preset} quality={quality} rate={rate} selectedObjectId={selectedObjectId} showSmallBodies={showSmallBodies} sunDirection={sunDirection} utcMs={utcMs} onSelect={onSelect} />
      : <FlightWorld dayMap={dayMap} navigation={navigation} paused={paused} quality={quality} rate={rate} selectedObjectId={selectedObjectId} showSmallBodies={showSmallBodies} sunDirection={sunDirection} utcMs={utcMs} onNavigationChange={onNavigationChange} onSelect={onSelect} />}
  </>
}
