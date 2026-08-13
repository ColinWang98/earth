import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export const CAMERA_PRESETS = [
  { id: 'orbit', label: '默认轨道', position: [0, 1.25, 9], earthRotation: 0, duration: 1.5 },
  { id: 'sunlit', label: '日照侧环绕', position: [5.8, 2.5, 6.4], earthRotation: -0.65, duration: 2.2 },
  { id: 'atmosphere', label: '贴近大气层', position: [0.2, 0.7, 3.08], earthRotation: 0.18, duration: 3.4 },
  { id: 'clouds', label: '云层掠过', position: [2.6, 0.4, 2.8], earthRotation: 0.72, duration: 4.2 },
  { id: 'china', label: '中国近景', position: [0.15, 0.38, 2.92], earthRotation: 2.75, duration: 4.1 },
] as const

export type CameraPresetId = typeof CAMERA_PRESETS[number]['id']
type Quality = 'desktop' | 'mobile'
type Motion = { active: boolean, target: THREE.Vector3, duration: number }
type Props = {
  annotations: boolean
  forecastClouds: boolean
  preset: CameraPresetId
  quality: Quality
  onPresetChange: (preset: CameraPresetId) => void
  onSkyReady: () => void
  onCloudStatus: (status: string) => void
}

const DAY_MAP = `${import.meta.env.BASE_URL}assets/earth-blue-marble-5k.jpg`
const NIGHT_MAP = `${import.meta.env.BASE_URL}assets/earth-night.png`
const OCEAN_MASK = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const CLOUD_MAP = `${import.meta.env.BASE_URL}assets/earth-clouds-real.jpg`
const CHINA_DETAIL_MAP = `${import.meta.env.BASE_URL}assets/east-asia-blue-marble-4k.jpg`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`
const LIGHT_POSITION = new THREE.Vector3(-22, 0.4, 18)
const MOON_POSITION: [number, number, number] = [-22, 8, -16]
const STAR_CATALOG = `${import.meta.env.BASE_URL}assets/stars/hyg-bright-stars.bin`
const EARTH_RADIUS = 2.25

function useTexture(url: string, quality: Quality, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace) {
  return useMemo(() => {
    const texture = new THREE.TextureLoader().load(url)
    texture.colorSpace = colorSpace
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = quality === 'desktop' ? 8 : 3
    return texture
  }, [url, quality, colorSpace])
}

function useLazyTexture(url: string, active: boolean, quality: Quality) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!active || texture) return
    const loader = new THREE.TextureLoader()
    loader.load(url, (nextTexture) => {
      nextTexture.colorSpace = THREE.SRGBColorSpace
      nextTexture.generateMipmaps = true
      nextTexture.minFilter = THREE.LinearMipmapLinearFilter
      nextTexture.anisotropy = quality === 'desktop' ? 8 : 3
      setTexture(nextTexture)
    })
  }, [active, quality, texture, url])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

function Atmosphere({ segments }: { segments: number }) {
  return <mesh renderOrder={4}>
    <sphereGeometry args={[2.305, segments, segments]} />
    <shaderMaterial transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} vertexShader={`
      varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `} fragmentShader={`
      varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 sunlight = normalize(vec3(-22.0, 0.4, 18.0));
        float horizon = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 4.6);
        float daylight = smoothstep(-0.15, 0.85, dot(vWorldNormal, sunlight));
        vec3 color = mix(vec3(0.015, 0.055, 0.16), vec3(0.11, 0.43, 1.0), daylight);
        gl_FragColor = vec4(color, horizon * (0.018 + daylight * 0.14));
      }
    `} />
  </mesh>
}

function Aurora({ segments }: { segments: number }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  useFrame((_, delta) => { if (material.current) material.current.uniforms.time.value += delta })
  return <mesh renderOrder={5}>
    <sphereGeometry args={[2.33, segments, segments]} />
    <shaderMaterial ref={material} transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={{ time: { value: 0 } }} vertexShader={`
      varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `} fragmentShader={`
      uniform float time; varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main() {
        vec3 sun = normalize(vec3(-22.0, 0.4, 18.0));
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float polar = abs(vWorldNormal.y);
        float nightSide = pow(1.0 - smoothstep(-0.08, 0.34, dot(vWorldNormal, sun)), 1.08);
        float limb = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 1.42);
        float longitude = atan(vWorldNormal.z, vWorldNormal.x);
        float waviness = 0.045 * sin(longitude * 3.0 + time * 0.12) + 0.025 * sin(longitude * 11.0 - time * 0.20);
        float belt = 1.0 - smoothstep(0.035, 0.13, abs(polar - (0.53 + waviness)));
        float streaks = 0.5 + 0.5 * sin(longitude * 15.0 + polar * 19.0 + time * 0.30);
        float gaps = smoothstep(0.51, 0.80, 0.5 + 0.5 * sin(longitude * 4.7 + sin(longitude * 1.8) * 2.0));
        float strands = mix(0.18, 1.0, pow(streaks, 2.5));
        float distanceFade = 1.0 - smoothstep(4.0, 6.6, length(cameraPosition));
        float alpha = belt * gaps * strands * nightSide * limb * distanceFade * 0.34;
        float redFringe = smoothstep(0.58, 0.74, polar) * gaps * 0.22;
        vec3 green = vec3(0.02, 0.78, 0.39);
        vec3 color = mix(green, vec3(0.72, 0.08, 0.20), redFringe);
        gl_FragColor = vec4(color, alpha);
      }
    `} />
  </mesh>
}

const CLOUD_LONGITUDE_STEPS = 18
const CLOUD_LATITUDE_STEPS = 9

function cloudCoordinates() {
  const latitudes: number[] = []
  const longitudes: number[] = []
  for (let row = 0; row < CLOUD_LATITUDE_STEPS; row += 1) {
    const latitude = 80 - row * (160 / (CLOUD_LATITUDE_STEPS - 1))
    for (let column = 0; column < CLOUD_LONGITUDE_STEPS; column += 1) {
      latitudes.push(latitude)
      longitudes.push(-180 + column * (360 / CLOUD_LONGITUDE_STEPS))
    }
  }
  return { latitudes, longitudes }
}

function useForecastCloudMask(enabled: boolean, onStatus: (status: string) => void) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  useEffect(() => {
    if (!enabled) {
      setTexture(null)
      onStatus('静态卫星云层 · 三层细节')
      return
    }
    let cancelled = false
    let timer: number | undefined
    let activeTexture: THREE.CanvasTexture | null = null
    const load = async () => {
      onStatus('正在获取全球预报云量…')
      try {
        const { latitudes, longitudes } = cloudCoordinates()
        const params = new URLSearchParams({
          latitude: latitudes.join(','), longitude: longitudes.join(','),
          current: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high', forecast_days: '1', timezone: 'GMT',
        })
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
        if (!response.ok) throw new Error('Cloud forecast unavailable')
        const readings = await response.json() as Array<{ current?: { cloud_cover?: number, cloud_cover_low?: number, cloud_cover_mid?: number, cloud_cover_high?: number } }>
        if (cancelled || !Array.isArray(readings)) return
        const canvas = document.createElement('canvas')
        canvas.width = CLOUD_LONGITUDE_STEPS
        canvas.height = CLOUD_LATITUDE_STEPS
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        const image = context.createImageData(canvas.width, canvas.height)
        readings.forEach(({ current }, index) => {
          const total = THREE.MathUtils.clamp((current?.cloud_cover ?? 0) / 100, 0, 1)
          const layered = THREE.MathUtils.clamp(((current?.cloud_cover_low ?? 0) * 0.52 + (current?.cloud_cover_mid ?? 0) * 0.3 + (current?.cloud_cover_high ?? 0) * 0.18) / 100, 0, 1)
          const value = Math.round(THREE.MathUtils.smoothstep(total * 0.72 + layered * 0.28, 0.16, 0.86) * 255)
          image.data.set([value, value, value, 255], index * 4)
        })
        context.putImageData(image, 0, 0)
        const nextTexture = new THREE.CanvasTexture(canvas)
        nextTexture.colorSpace = THREE.NoColorSpace
        nextTexture.wrapS = THREE.RepeatWrapping
        nextTexture.minFilter = THREE.LinearFilter
        nextTexture.magFilter = THREE.LinearFilter
        activeTexture?.dispose()
        activeTexture = nextTexture
        setTexture(nextTexture)
        onStatus('预报云层 · Open‑Meteo · 每 45 分钟更新')
      } catch {
        if (!cancelled) onStatus('预报云层暂不可用 · 已保留三层静态云')
      }
    }
    void load()
    timer = window.setInterval(() => void load(), 45 * 60 * 1000)
    return () => { cancelled = true; if (timer) window.clearInterval(timer); activeTexture?.dispose() }
  }, [enabled, onStatus])
  return texture
}

function CloudLayer({ cloudMap, forecastMask, radius, density, speed, offset, segments }: { cloudMap: THREE.Texture, forecastMask: THREE.Texture | null, radius: number, density: number, speed: number, offset: number, segments: number }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const fallbackMask = useMemo(() => new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat), [])
  useEffect(() => () => fallbackMask.dispose(), [fallbackMask])
  useFrame((_, delta) => { if (material.current) material.current.uniforms.time.value += delta * speed })
  return <mesh renderOrder={3}>
    <sphereGeometry args={[radius, segments, segments]} />
    <shaderMaterial ref={material} transparent depthWrite={false} uniforms={{ cloudMap: { value: cloudMap }, forecastMask: { value: forecastMask ?? fallbackMask }, time: { value: offset }, density: { value: density }, usesForecast: { value: forecastMask ? 1 : 0 } }} vertexShader={`
      varying vec2 vUv; varying vec3 vWorldNormal;
      void main() { vUv = uv; vWorldNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `} fragmentShader={`
      uniform sampler2D cloudMap; uniform sampler2D forecastMask; uniform float time; uniform float density; uniform float usesForecast;
      varying vec2 vUv; varying vec3 vWorldNormal;
      void main() {
        vec2 cloudUv = vec2(fract(vUv.x + time), vUv.y);
        float cloud = texture2D(cloudMap, cloudUv).r;
        float regional = texture2D(forecastMask, vUv).r;
        float shape = smoothstep(0.28, 0.8, cloud);
        float alpha = shape * density * mix(1.0, regional, usesForecast);
        float daylight = smoothstep(-0.16, 0.24, dot(vWorldNormal, normalize(vec3(-22.0, 0.4, 18.0))));
        vec3 color = mix(vec3(0.02, 0.026, 0.04), vec3(0.82, 0.85, 0.87), daylight);
        gl_FragColor = vec4(color, alpha * mix(0.10, 0.60, daylight));
      }
    `} />
  </mesh>
}

function EarthSurface({ dayMap, nightMap, oceanMask, segments }: { dayMap: THREE.Texture, nightMap: THREE.Texture, oceanMask: THREE.Texture, segments: number }) {
  return <mesh castShadow receiveShadow>
    <sphereGeometry args={[EARTH_RADIUS, segments, segments]} />
    <shaderMaterial uniforms={{ dayMap: { value: dayMap }, nightMap: { value: nightMap }, oceanMask: { value: oceanMask } }} vertexShader={`
      varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `} fragmentShader={`
      uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D oceanMask;
      varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition;
      void main() {
        vec3 sunlight = normalize(vec3(-22.0, 0.4, 18.0));
        float illumination = dot(vWorldNormal, sunlight);
        float daylight = smoothstep(-0.16, 0.24, illumination);
        vec3 day = pow(texture2D(dayMap, vUv).rgb, vec3(0.86)) * 1.38;
        vec3 night = pow(texture2D(nightMap, vUv).rgb, vec3(0.58));
        float ocean = texture2D(oceanMask, vUv).r;
        vec3 surface = day * mix(0.02, 1.0, daylight);
        surface += vec3(0.012, 0.055, 0.105) * ocean * daylight;
        float nightSide = pow(1.0 - daylight, 1.35);
        surface += day * vec3(0.010, 0.020, 0.040) * nightSide;
        surface += night * 0.46 * nightSide;
        gl_FragColor = vec4(surface, 1.0);
      }
    `} />
  </mesh>
}

function ChinaDetail({ map, active, quality }: { map: THREE.Texture | null, active: boolean, quality: Quality }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const opacity = useRef(0)
  useFrame((_, delta) => {
    opacity.current = THREE.MathUtils.damp(opacity.current, active && map ? 1 : 0, 2.6, delta)
    if (material.current) material.current.uniforms.opacity.value = opacity.current
  })
  if (!map) return null
  const segments = quality === 'desktop' ? 96 : 56
  return <mesh renderOrder={2}>
    <sphereGeometry args={[EARTH_RADIUS + 0.003, segments, segments, Math.PI * 1.5, Math.PI * 0.25, Math.PI * 0.195, Math.PI * 0.222]} />
    <shaderMaterial ref={material} transparent depthWrite={false} uniforms={{ detailMap: { value: map }, opacity: { value: 0 } }} vertexShader={`
      varying vec2 vUv; varying vec3 vWorldNormal;
      void main() { vUv = uv; vWorldNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `} fragmentShader={`
      uniform sampler2D detailMap; uniform float opacity;
      varying vec2 vUv; varying vec3 vWorldNormal;
      void main() {
        float daylight = smoothstep(-0.16, 0.24, dot(vWorldNormal, normalize(vec3(-22.0, 0.4, 18.0))));
        float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(0.0, 0.07, 1.0 - vUv.x) * smoothstep(0.0, 0.09, vUv.y) * smoothstep(0.0, 0.09, 1.0 - vUv.y);
        vec3 detail = pow(texture2D(detailMap, vUv).rgb, vec3(0.58)) * vec3(1.12, 1.18, 1.25);
        float localExposure = mix(0.38, 1.0, daylight);
        gl_FragColor = vec4(detail * localExposure, edge * opacity * localExposure);
      }
    `} />
  </mesh>
}

function Earth({ preset, forecastClouds, onCloudStatus, quality }: { preset: CameraPresetId, forecastClouds: boolean, onCloudStatus: (status: string) => void, quality: Quality }) {
  const earth = useRef<THREE.Group>(null)
  const day = useTexture(DAY_MAP, quality)
  const night = useTexture(NIGHT_MAP, quality)
  const oceanMask = useTexture(OCEAN_MASK, quality, THREE.NoColorSpace)
  const cloud = useTexture(CLOUD_MAP, quality, THREE.NoColorSpace)
  const chinaDetail = useLazyTexture(CHINA_DETAIL_MAP, true, quality)
  const forecastMask = useForecastCloudMask(forecastClouds, onCloudStatus)
  const item = CAMERA_PRESETS.find((entry) => entry.id === preset) ?? CAMERA_PRESETS[0]
  const segments = quality === 'desktop' ? 160 : 96
  const cloudCoverage = preset === 'china' ? 0.48 : 1
  useFrame((_, delta) => { if (earth.current) earth.current.rotation.y = THREE.MathUtils.damp(earth.current.rotation.y, item.earthRotation, 3 / item.duration, delta) })
  return <group ref={earth}>
    <EarthSurface dayMap={day} nightMap={night} oceanMask={oceanMask} segments={segments} />
    <ChinaDetail map={chinaDetail} active={preset === 'china'} quality={quality} />
    <CloudLayer cloudMap={cloud} forecastMask={forecastMask} radius={2.274} density={0.28 * cloudCoverage} speed={0.0017} offset={0} segments={segments} />
    <CloudLayer cloudMap={cloud} forecastMask={forecastMask} radius={2.287} density={0.085 * cloudCoverage} speed={-0.0009} offset={0.19} segments={segments} />
    <CloudLayer cloudMap={cloud} forecastMask={forecastMask} radius={2.303} density={0.035 * cloudCoverage} speed={0.00045} offset={0.47} segments={segments} />
    <Atmosphere segments={segments} />
    <Aurora segments={segments} />
  </group>
}

function Moon({ quality }: { quality: Quality }) {
  const moon = useRef<THREE.Mesh>(null)
  const map = useTexture(MOON_MAP, quality)
  useFrame((_, delta) => { if (moon.current) moon.current.rotation.y += delta * 0.01 })
  return <mesh ref={moon} position={MOON_POSITION}><sphereGeometry args={[0.58, quality === 'desktop' ? 64 : 40, quality === 'desktop' ? 64 : 40]} /><meshStandardMaterial map={map} roughness={1} /></mesh>
}

function starColor(index: number, target: THREE.Color) {
  if (index < 0.1) return target.set('#9fbcff')
  if (index < 0.55) return target.lerpColors(new THREE.Color('#c8d8ff'), new THREE.Color('#fff7e4'), (index - 0.1) / 0.45)
  if (index < 1.25) return target.lerpColors(new THREE.Color('#fff7e4'), new THREE.Color('#ffd19a'), (index - 0.55) / 0.7)
  return target.set('#ffb16f')
}

function StarCatalog({ onReady, quality }: { onReady: () => void, quality: Quality }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const material = useRef<THREE.PointsMaterial>(null)
  const { camera } = useThree()
  useEffect(() => {
    let disposed = false
    let nextGeometry: THREE.BufferGeometry | null = null
    fetch(STAR_CATALOG).then((response) => response.arrayBuffer()).then((buffer) => {
      if (disposed) return
      const source = new Float32Array(buffer)
      const count = Math.min(source.length / 5, quality === 'desktop' ? 1250 : 850)
      const positions = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)
      const color = new THREE.Color()
      for (let index = 0; index < count; index += 1) {
        positions.set([source[index * 5] * 170, source[index * 5 + 1] * 170, source[index * 5 + 2] * 170], index * 3)
        starColor(source[index * 5 + 3], color)
        colors.set([color.r, color.g, color.b], index * 3)
      }
      nextGeometry = new THREE.BufferGeometry()
      nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      nextGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      setGeometry(nextGeometry)
      onReady()
    })
    return () => { disposed = true; nextGeometry?.dispose() }
  }, [onReady, quality])
  useFrame(() => { if (material.current) material.current.opacity = THREE.MathUtils.clamp((camera.position.length() - 2.6) / 12, 0.22, 0.62) })
  if (!geometry) return null
  return <points geometry={geometry} frustumCulled={false}><pointsMaterial ref={material} size={quality === 'desktop' ? 0.95 : 0.78} sizeAttenuation={false} vertexColors transparent opacity={0.5} depthWrite={false} depthTest /></points>
}

const labels = [
  { position: [-1.9, -1.9, 0.7] as [number, number, number], title: '昼夜分界线', sub: 'Terminator line' },
  { position: [-22, 8.9, -16] as [number, number, number], title: '月球', sub: 'Moon · enlarged view' },
]

function Annotations({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <group>{labels.map(({ position, title, sub }) => <group key={title} position={position}>
    <mesh position={[0, -0.12, 0]}><planeGeometry args={[1.76, 0.72]} /><meshBasicMaterial color="#07111d" transparent opacity={0.68} /></mesh>
    <Text fontSize={0.16} color="#dbeeff" anchorX="center" position={[0, 0.11, 0.01]}>{title}</Text>
    <Text fontSize={0.09} color="#7da9c8" anchorX="center" position={[0, -0.13, 0.01]}>{sub}</Text>
  </group>)}</group>
}

function presetOrbit(preset: CameraPresetId) {
  const [x, y, z] = (CAMERA_PRESETS.find((item) => item.id === preset) ?? CAMERA_PRESETS[0]).position
  const distance = Math.hypot(x, y, z)
  return { distance, theta: Math.atan2(-x, -z), phi: Math.asin(THREE.MathUtils.clamp((0.25 - y) / distance, -0.75, 0.75)) }
}

function XRMovement({ preset, forecastClouds, onCloudStatus, quality }: { preset: CameraPresetId, forecastClouds: boolean, onCloudStatus: (status: string) => void, quality: Quality }) {
  const world = useRef<THREE.Group>(null)
  const { gl } = useThree()
  const orbit = useRef({ ...presetOrbit('orbit'), active: false })
  useEffect(() => { Object.assign(orbit.current, presetOrbit(preset), { active: true }) }, [preset])
  useFrame((_, delta) => {
    const session = gl.xr.getSession()
    if (!session || !world.current) return
    for (const source of session.inputSources) {
      const axes = source.gamepad?.axes
      if (!axes || !source.handedness) continue
      if (Math.abs(axes[2]) > 0.12 || Math.abs(axes[3]) > 0.12) orbit.current.active = false
      if (source.handedness === 'left') {
        orbit.current.theta -= axes[2] * delta * 1.1
        orbit.current.phi = THREE.MathUtils.clamp(orbit.current.phi + axes[3] * delta * 0.65, -0.45, 0.55)
      }
      if (source.handedness === 'right') orbit.current.distance = THREE.MathUtils.clamp(orbit.current.distance + axes[3] * delta * 2.1, 2.72, 15)
    }
    const { theta, phi, distance } = orbit.current
    world.current.position.set(-Math.sin(theta) * Math.cos(phi) * distance, -Math.sin(phi) * distance + 0.25, -Math.cos(theta) * Math.cos(phi) * distance)
  })
  return <group ref={world}><Earth preset={preset} forecastClouds={forecastClouds} onCloudStatus={onCloudStatus} quality={quality} /><Moon quality={quality} /></group>
}

function CameraDirector({ preset, controls, motion }: { preset: CameraPresetId, controls: React.RefObject<OrbitControlsImpl | null>, motion: React.MutableRefObject<Motion> }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const item = CAMERA_PRESETS.find((entry) => entry.id === preset) ?? CAMERA_PRESETS[0]
    motion.current = { active: true, target: new THREE.Vector3(...item.position), duration: item.duration }
  }, [preset, motion])
  useFrame((_, delta) => {
    if (gl.xr.isPresenting || !motion.current.active) return
    const blend = 1 - Math.exp(-delta * 4 / motion.current.duration)
    camera.position.lerp(motion.current.target, blend)
    controls.current?.target.lerp(new THREE.Vector3(0, 0, 0), blend)
    controls.current?.update()
    if (camera.position.distanceTo(motion.current.target) < 0.015) motion.current.active = false
  })
  return null
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

export function Scene({ annotations, forecastClouds, preset, quality, onPresetChange, onSkyReady, onCloudStatus }: Props) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const motion = useRef<Motion>({ active: false, target: new THREE.Vector3(...CAMERA_PRESETS[0].position), duration: 1.5 })
  useEffect(() => { document.title = 'Earth Observation / 自由太空观察' }, [])
  return <>
    <color attach="background" args={['#010207']} />
    <ambientLight intensity={0.09} color="#c6d7e7" />
    <directionalLight position={LIGHT_POSITION} intensity={3.15} color="#fff7df" />
    <StarCatalog onReady={onSkyReady} quality={quality} />
    <XRMovement preset={preset} forecastClouds={forecastClouds} onCloudStatus={onCloudStatus} quality={quality} />
    <CameraDirector preset={preset} controls={controls} motion={motion} />
    <VRPresetMenu onPresetChange={onPresetChange} />
    <Annotations visible={annotations} />
    <OrbitControls ref={controls} enableDamping dampingFactor={0.06} minDistance={2.72} maxDistance={15} target={[0, 0, 0]} onStart={() => { motion.current.active = false }} />
  </>
}
