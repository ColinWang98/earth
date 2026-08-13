import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'

export const CAMERA_PRESETS = [
  { id: 'orbit', label: '默认轨道', position: [0, 1.25, 9], earthRotation: 0 },
  { id: 'sunlit', label: '日照侧环绕', position: [5.8, 2.5, 6.4], earthRotation: -0.65 },
  { id: 'atmosphere', label: '贴近大气层', position: [0.2, 0.7, 3.08], earthRotation: 0.18 },
  { id: 'clouds', label: '云层掠过', position: [2.6, 0.4, 2.8], earthRotation: 0.72 },
  { id: 'china', label: '中国近景', position: [-2, 1.1, 4.1], earthRotation: 2.06 },
] as const

export type CameraPresetId = typeof CAMERA_PRESETS[number]['id']

type Props = {
  annotations: boolean
  forecastClouds: boolean
  preset: CameraPresetId
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

function useTexture(url: string) {
  return useMemo(() => {
    const texture = new THREE.TextureLoader().load(url)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 8
    return texture
  }, [url])
}

function Atmosphere() {
  return <mesh>
    <sphereGeometry args={[2.34, 128, 128]} />
    <shaderMaterial transparent depthWrite={false} side={THREE.BackSide} vertexShader={`
      varying vec3 vNormal; varying vec3 vWorldPosition;
      void main() { vNormal = normalize(normalMatrix * normal); vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `} fragmentShader={`
      varying vec3 vNormal; varying vec3 vWorldPosition;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 sunlight = normalize(vec3(3.0, 4.0, 30.0));
        float rim = pow(1.0 - max(dot(vNormal, viewDirection), 0.0), 2.6);
        float sun = max(dot(vNormal, sunlight), 0.0);
        vec3 color = mix(vec3(0.01, 0.04, 0.12), vec3(0.08, 0.32, 0.78), sun);
        gl_FragColor = vec4(color, rim * (0.06 + sun * 0.24));
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
      onStatus('静态卫星云层')
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
          latitude: latitudes.join(','),
          longitude: longitudes.join(','),
          current: 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high',
          forecast_days: '1',
          timezone: 'GMT',
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
        readings.forEach((reading, index) => {
          const current = reading.current
          const total = THREE.MathUtils.clamp((current?.cloud_cover ?? 0) / 100, 0, 1)
          const lowerClouds = THREE.MathUtils.clamp(((current?.cloud_cover_low ?? 0) * 0.52 + (current?.cloud_cover_mid ?? 0) * 0.3 + (current?.cloud_cover_high ?? 0) * 0.18) / 100, 0, 1)
          const amount = THREE.MathUtils.smoothstep(total * 0.72 + lowerClouds * 0.28, 0.16, 0.86)
          const pixel = index * 4
          const value = Math.round(amount * 255)
          image.data[pixel] = value
          image.data[pixel + 1] = value
          image.data[pixel + 2] = value
          image.data[pixel + 3] = 255
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
        if (!cancelled) onStatus('预报云层暂不可用 · 已保留静态云层')
      }
    }
    void load()
    timer = window.setInterval(() => void load(), 45 * 60 * 1000)
    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
      activeTexture?.dispose()
    }
  }, [enabled, onStatus])
  return texture
}

function Earth({ preset, forecastClouds, onCloudStatus }: { preset: CameraPresetId, forecastClouds: boolean, onCloudStatus: (status: string) => void }) {
  const earth = useRef<THREE.Group>(null)
  const clouds = useRef<THREE.Mesh>(null)
  const day = useTexture(DAY_MAP)
  const night = useTexture(NIGHT_MAP)
  const normal = useTexture(NORMAL_MAP)
  const specular = useTexture(SPECULAR_MAP)
  const cloud = useTexture(CLOUD_MAP)
  const forecastMask = useForecastCloudMask(forecastClouds, onCloudStatus)
  const targetRotation = CAMERA_PRESETS.find((item) => item.id === preset)?.earthRotation ?? 0

  useFrame((_, delta) => {
    if (earth.current) earth.current.rotation.y = THREE.MathUtils.damp(earth.current.rotation.y, targetRotation, 2.7, delta)
    if (clouds.current) clouds.current.rotation.y += delta * 0.007
  })

  return <group ref={earth}>
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[2.25, 160, 160]} />
      <meshPhongMaterial map={day} color="#f7fbff" emissiveMap={night} emissive={new THREE.Color('#d9edff')} emissiveIntensity={0.24} normalMap={normal} normalScale={new THREE.Vector2(0.48, 0.48)} specularMap={specular} specular={new THREE.Color('#81b5cf')} shininess={12} />
    </mesh>
    <mesh>
      <sphereGeometry args={[2.253, 160, 160]} />
      <meshBasicMaterial map={day} transparent opacity={0.72} depthWrite={false} />
    </mesh>
    <mesh>
      <sphereGeometry args={[2.257, 160, 160]} />
      <meshBasicMaterial color="#2f78b5" transparent opacity={0.24} depthWrite={false} />
    </mesh>
    <mesh ref={clouds}>
      <sphereGeometry args={[2.286, 160, 160]} />
      <meshPhongMaterial map={cloud} alphaMap={forecastMask ?? undefined} transparent opacity={forecastClouds ? 0.42 : 0.22} depthWrite={false} color="#e4f1f8" specular="#ffffff" shininess={22} />
    </mesh>
    <Atmosphere />
  </group>
}

function Moon() {
  const moon = useRef<THREE.Mesh>(null)
  const map = useTexture(MOON_MAP)
  useFrame((_, delta) => { if (moon.current) moon.current.rotation.y += delta * 0.01 })
  return <mesh ref={moon} position={MOON_POSITION}><sphereGeometry args={[0.58, 64, 64]} /><meshStandardMaterial map={map} roughness={1} /></mesh>
}

function starColor(index: number, target: THREE.Color) {
  if (index < 0.1) return target.set('#9fbcff')
  if (index < 0.55) return target.lerpColors(new THREE.Color('#c8d8ff'), new THREE.Color('#fff7e4'), (index - 0.1) / 0.45)
  if (index < 1.25) return target.lerpColors(new THREE.Color('#fff7e4'), new THREE.Color('#ffd19a'), (index - 0.55) / 0.7)
  return target.set('#ffb16f')
}

function StarCatalog({ onReady }: { onReady: () => void }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let disposed = false
    let nextGeometry: THREE.BufferGeometry | null = null
    fetch(STAR_CATALOG).then((response) => response.arrayBuffer()).then((buffer) => {
      if (disposed) return
      const source = new Float32Array(buffer)
      const count = Math.min(source.length / 5, 2000)
      const positions = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)
      const color = new THREE.Color()
      for (let index = 0; index < count; index += 1) {
        positions[index * 3] = source[index * 5] * 170
        positions[index * 3 + 1] = source[index * 5 + 1] * 170
        positions[index * 3 + 2] = source[index * 5 + 2] * 170
        starColor(source[index * 5 + 3], color)
        colors[index * 3] = color.r
        colors[index * 3 + 1] = color.g
        colors[index * 3 + 2] = color.b
      }
      nextGeometry = new THREE.BufferGeometry()
      nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      nextGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      setGeometry(nextGeometry)
      onReady()
    })
    return () => { disposed = true; nextGeometry?.dispose() }
  }, [onReady])
  if (!geometry) return null
  return <points geometry={geometry} frustumCulled={false}>
    <pointsMaterial size={1.15} sizeAttenuation={false} vertexColors transparent opacity={0.84} depthWrite={false} depthTest />
  </points>
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

function XRMovement({ preset, forecastClouds, onCloudStatus }: { preset: CameraPresetId, forecastClouds: boolean, onCloudStatus: (status: string) => void }) {
  const world = useRef<THREE.Group>(null)
  const { gl } = useThree()
  const orbit = useRef({ theta: 0, phi: 0.15, distance: 9 })
  const presetPosition = CAMERA_PRESETS.find((item) => item.id === preset)?.position ?? CAMERA_PRESETS[0].position
  useEffect(() => {
    const [x, y, z] = presetPosition
    orbit.current.distance = Math.hypot(x, y, z)
    orbit.current.theta = Math.atan2(-x, -z)
    orbit.current.phi = Math.asin(THREE.MathUtils.clamp((0.25 - y) / orbit.current.distance, -0.75, 0.75))
  }, [preset, presetPosition])
  useFrame((_, delta) => {
    const session = gl.xr.getSession()
    if (!session || !world.current) return
    for (const source of session.inputSources) {
      const axes = source.gamepad?.axes
      if (!axes || !source.handedness) continue
      if (source.handedness === 'left') {
        orbit.current.theta -= axes[2] * delta * 1.1
        orbit.current.phi = THREE.MathUtils.clamp(orbit.current.phi + axes[3] * delta * 0.65, -0.45, 0.55)
      }
      if (source.handedness === 'right') orbit.current.distance = THREE.MathUtils.clamp(orbit.current.distance + axes[3] * delta * 2.1, 2.72, 15)
    }
    const { theta, phi, distance } = orbit.current
    world.current.position.set(-Math.sin(theta) * Math.cos(phi) * distance, -Math.sin(phi) * distance + 0.25, -Math.cos(theta) * Math.cos(phi) * distance)
  })
  return <group ref={world}><Earth preset={preset} forecastClouds={forecastClouds} onCloudStatus={onCloudStatus} /><Moon /></group>
}

function PresetDriver({ preset }: { preset: CameraPresetId }) {
  const { camera, gl } = useThree()
  const position = CAMERA_PRESETS.find((item) => item.id === preset)?.position ?? CAMERA_PRESETS[0].position
  useEffect(() => {
    if (gl.xr.isPresenting) return
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(0, 0, 0)
  }, [camera, gl, position])
  return null
}

function VRPresetMenu({ onPresetChange }: { onPresetChange: (preset: CameraPresetId) => void }) {
  const { gl } = useThree()
  const [presenting, setPresenting] = useState(gl.xr.isPresenting)
  useEffect(() => {
    const update = () => setPresenting(gl.xr.isPresenting)
    gl.xr.addEventListener('sessionstart', update)
    gl.xr.addEventListener('sessionend', update)
    return () => { gl.xr.removeEventListener('sessionstart', update); gl.xr.removeEventListener('sessionend', update) }
  }, [gl])
  if (!presenting) return null
  return <group position={[0, 3.8, -1.4]} rotation={[0, 0, 0]}>
    {CAMERA_PRESETS.map((preset, index) => <group key={preset.id} position={[(index - 2) * 1.05, 0, -Math.abs(index - 2) * 0.2]} onClick={(event) => { event.stopPropagation(); onPresetChange(preset.id) }}>
      <mesh><planeGeometry args={[0.92, 0.34]} /><meshBasicMaterial color="#0a1b2d" transparent opacity={0.9} /></mesh>
      <Text fontSize={0.095} color="#dbeeff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>{preset.label}</Text>
    </group>)}
  </group>
}

export function Scene({ annotations, forecastClouds, preset, onPresetChange, onSkyReady, onCloudStatus }: Props) {
  useEffect(() => { document.title = 'Earth Observation / 自由太空观察' }, [])
  return <>
    <color attach="background" args={['#010207']} />
    <ambientLight intensity={0.34} color="#d3e8fa" />
    <directionalLight position={LIGHT_POSITION} intensity={2.35} color="#fff7df" />
    <StarCatalog onReady={onSkyReady} />
    <XRMovement preset={preset} forecastClouds={forecastClouds} onCloudStatus={onCloudStatus} />
    <PresetDriver preset={preset} />
    <VRPresetMenu onPresetChange={onPresetChange} />
    <Annotations visible={annotations} />
    <OrbitControls enableDamping dampingFactor={0.06} minDistance={2.72} maxDistance={15} target={[0, 0, 0]} />
  </>
}
