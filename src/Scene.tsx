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
  { id: 'china', label: '中国近景', position: [-2, 1.1, 4.1], earthRotation: 2.06, duration: 3.6 },
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
const NORMAL_MAP = `${import.meta.env.BASE_URL}assets/earth-normal.jpg`
const SPECULAR_MAP = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const CLOUD_MAP = `${import.meta.env.BASE_URL}assets/earth-clouds-real.jpg`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`
const LIGHT_POSITION = new THREE.Vector3(3, 4, 30)
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
        vec3 sunlight = normalize(vec3(3.0, 4.0, 30.0));
        float horizon = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 4.6);
        float daylight = smoothstep(-0.15, 0.85, dot(vWorldNormal, sunlight));
        vec3 color = mix(vec3(0.015, 0.055, 0.16), vec3(0.11, 0.43, 1.0), daylight);
        gl_FragColor = vec4(color, horizon * (0.018 + daylight * 0.14));
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
        float sun = max(dot(vWorldNormal, normalize(vec3(3.0, 4.0, 30.0))), 0.0);
        vec3 color = mix(vec3(0.48, 0.58, 0.66), vec3(0.98, 1.0, 1.0), 0.45 + sun * 0.55);
        gl_FragColor = vec4(color, alpha);
      }
    `} />
  </mesh>
}

function Earth({ preset, forecastClouds, onCloudStatus, quality }: { preset: CameraPresetId, forecastClouds: boolean, onCloudStatus: (status: string) => void, quality: Quality }) {
  const earth = useRef<THREE.Group>(null)
  const day = useTexture(DAY_MAP, quality)
  const night = useTexture(NIGHT_MAP, quality)
  const normal = useTexture(NORMAL_MAP, quality, THREE.NoColorSpace)
  const specular = useTexture(SPECULAR_MAP, quality, THREE.NoColorSpace)
  const cloud = useTexture(CLOUD_MAP, quality, THREE.NoColorSpace)
  const forecastMask = useForecastCloudMask(forecastClouds, onCloudStatus)
  const item = CAMERA_PRESETS.find((entry) => entry.id === preset) ?? CAMERA_PRESETS[0]
  const segments = quality === 'desktop' ? 160 : 96
  useFrame((_, delta) => { if (earth.current) earth.current.rotation.y = THREE.MathUtils.damp(earth.current.rotation.y, item.earthRotation, 3 / item.duration, delta) })
  return <group ref={earth}>
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[EARTH_RADIUS, segments, segments]} />
      <meshPhongMaterial map={day} color="#c7e8ff" emissiveMap={night} emissive="#8bb8de" emissiveIntensity={0.18} normalMap={normal} normalScale={new THREE.Vector2(0.38, 0.38)} specularMap={specular} specular="#74b8e8" shininess={17} />
    </mesh>
    <mesh renderOrder={1}><sphereGeometry args={[2.252, segments, segments]} /><meshBasicMaterial color="#1873c2" transparent opacity={0.1} depthWrite={false} /></mesh>
    <CloudLayer cloudMap={cloud} forecastMask={forecastMask} radius={2.274} density={0.46} speed={0.0017} offset={0} segments={segments} />
    <CloudLayer cloudMap={cloud} forecastMask={forecastMask} radius={2.287} density={0.18} speed={-0.0009} offset={0.19} segments={segments} />
    <CloudLayer cloudMap={cloud} forecastMask={forecastMask} radius={2.303} density={0.09} speed={0.00045} offset={0.47} segments={segments} />
    <Atmosphere segments={segments} />
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
    <ambientLight intensity={0.47} color="#d6ebff" />
    <directionalLight position={LIGHT_POSITION} intensity={2.7} color="#fff6db" />
    <StarCatalog onReady={onSkyReady} quality={quality} />
    <XRMovement preset={preset} forecastClouds={forecastClouds} onCloudStatus={onCloudStatus} quality={quality} />
    <CameraDirector preset={preset} controls={controls} motion={motion} />
    <VRPresetMenu onPresetChange={onPresetChange} />
    <Annotations visible={annotations} />
    <OrbitControls ref={controls} enableDamping dampingFactor={0.06} minDistance={2.72} maxDistance={15} target={[0, 0, 0]} onStart={() => { motion.current.active = false }} />
  </>
}
