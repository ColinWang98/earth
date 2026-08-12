import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls, Stars, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'

type Props = {
  mode: 'cabin' | 'orbit'
  annotations: boolean
}

const DAY_MAP = `${import.meta.env.BASE_URL}assets/earth-day.jpg`
const NIGHT_MAP = `${import.meta.env.BASE_URL}assets/earth-night.png`
const NORMAL_MAP = `${import.meta.env.BASE_URL}assets/earth-normal.jpg`
const SPECULAR_MAP = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const CLOUD_MAP = `${import.meta.env.BASE_URL}assets/earth-clouds.png`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`

function useTexture(url: string) {
  return useMemo(() => {
    const texture = new THREE.TextureLoader().load(url)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [url])
}

function Earth() {
  const earth = useRef<THREE.Group>(null)
  const clouds = useRef<THREE.Mesh>(null)
  const day = useTexture(DAY_MAP)
  const night = useTexture(NIGHT_MAP)
  const normal = useTexture(NORMAL_MAP)
  const specular = useTexture(SPECULAR_MAP)
  const cloud = useTexture(CLOUD_MAP)

  useFrame((_, delta) => {
    if (earth.current) earth.current.rotation.y += delta * 0.025
    if (clouds.current) clouds.current.rotation.y += delta * 0.035
  })

  return (
    <group ref={earth}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[2.25, 96, 96]} />
        <meshPhongMaterial map={day} emissiveMap={night} emissive={new THREE.Color('#d7e9ff')} emissiveIntensity={0.34} normalMap={normal} normalScale={new THREE.Vector2(0.7, 0.7)} specularMap={specular} specular={new THREE.Color('#7596a6')} shininess={12} />
      </mesh>
      <mesh ref={clouds}>
        <sphereGeometry args={[2.29, 72, 72]} />
        <meshPhongMaterial map={cloud} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <Atmosphere />
    </group>
  )
}

function Atmosphere() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      glowColor: { value: new THREE.Color('#79caff') },
      sunDirection: { value: new THREE.Vector3(3, 4, 8).normalize() },
    },
    vertexShader: `varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main() { vWorldNormal = normalize(mat3(modelMatrix) * normal); vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0); }`,
    fragmentShader: `uniform vec3 glowColor; uniform vec3 sunDirection; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main() { vec3 normal = normalize(vWorldNormal); vec3 viewDirection = normalize(cameraPosition - vWorldPosition); float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.4); float sunlight = pow(max(dot(normal, sunDirection), 0.0), 0.45); float alpha = rim * sunlight * 0.48; gl_FragColor = vec4(glowColor * alpha, alpha); }`,
  }), [])
  return <mesh material={material}><sphereGeometry args={[2.29, 96, 96]} /></mesh>
}

function Moon() {
  const moon = useRef<THREE.Mesh>(null)
  const map = useTexture(MOON_MAP)
  useFrame((_, delta) => { if (moon.current) moon.current.rotation.y += delta * 0.01 })
  return <mesh ref={moon} position={[-5.6, 1.75, -3.2]}><sphereGeometry args={[0.6, 64, 64]} /><meshStandardMaterial map={map} roughness={1} /></mesh>
}

function Sun() {
  const glow = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => { if (glow.current) glow.current.scale.setScalar(1 + Math.sin(performance.now() * 0.001) * 0.025 + delta * 0) })
  return <group position={[3, 4, 8]}>
    <pointLight color="#fff0c4" intensity={100} distance={0} />
    <mesh><sphereGeometry args={[1.1, 48, 48]} /><meshBasicMaterial color="#fff5bd" /></mesh>
    <mesh ref={glow}><sphereGeometry args={[1.36, 48, 48]} /><meshBasicMaterial color="#ffb94d" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
  </group>
}

function Cabin({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <group>
    <mesh position={[0, -3.05, 2.8]} rotation={[0.1, 0, 0]}><boxGeometry args={[13, 0.34, 3.2]} /><meshStandardMaterial color="#101a29" metalness={0.8} roughness={0.36} /></mesh>
    <mesh position={[-5.7, 1.3, 1.7]} rotation={[0, 0.36, 0]}><boxGeometry args={[0.26, 5.6, 1.1]} /><meshStandardMaterial color="#17243a" metalness={0.85} roughness={0.3} /></mesh>
    <mesh position={[5.7, 1.3, 1.7]} rotation={[0, -0.36, 0]}><boxGeometry args={[0.26, 5.6, 1.1]} /><meshStandardMaterial color="#17243a" metalness={0.85} roughness={0.3} /></mesh>
    <pointLight position={[0, -1.7, 2.1]} color="#5ea9ff" intensity={0.4} distance={7} />
  </group>
}

const labels = [
  { position: [2.7, 0.8, 0] as [number, number, number], title: '大气层', sub: 'Atmospheric glow' },
  { position: [-1.9, -1.9, 0.7] as [number, number, number], title: '昼夜分界线', sub: 'Terminator line' },
  { position: [-5.6, 2.65, -3.2] as [number, number, number], title: '月球', sub: 'The Moon' },
  { position: [3.5, 4.7, 6.8] as [number, number, number], title: '太阳光照', sub: 'Solar illumination' },
]

function Annotations({ visible }: { visible: boolean }) {
  if (!visible) return null
  return <group>{labels.map(({ position, title, sub }) => <group key={title} position={position}>
    <mesh position={[0, -0.12, 0]}><planeGeometry args={[1.76, 0.72]} /><meshBasicMaterial color="#07111d" transparent opacity={0.68} /></mesh>
    <Text fontSize={0.16} color="#dbeeff" anchorX="center" position={[0, 0.11, 0.01]}>{title}</Text>
    <Text fontSize={0.09} color="#7da9c8" anchorX="center" position={[0, -0.13, 0.01]}>{sub}</Text>
  </group>)}</group>
}

function XRMovement() {
  const world = useRef<THREE.Group>(null)
  const { gl } = useThree()
  const orbit = useRef({ theta: 0, phi: 0.15, distance: 9 })
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
      if (source.handedness === 'right') orbit.current.distance = THREE.MathUtils.clamp(orbit.current.distance + axes[3] * delta * 2.1, 4.6, 15)
    }
    const { theta, phi, distance } = orbit.current
    world.current.position.set(-Math.sin(theta) * Math.cos(phi) * distance, -Math.sin(phi) * distance + 0.25, -Math.cos(theta) * Math.cos(phi) * distance)
  })
  return <group ref={world}><Earth /><Moon /><Sun /><Stars radius={120} depth={50} count={3300} factor={2.3} saturation={0.25} fade speed={0.1} /></group>
}

export function Scene({ mode, annotations }: Props) {
  useEffect(() => { document.title = mode === 'cabin' ? 'Earth Observation / 地球观察舱' : 'Free Orbit / 自由轨道' }, [mode])
  return <>
    <color attach="background" args={['#02050c']} />
    <ambientLight intensity={0.035} />
    <directionalLight position={[3, 4, 8]} intensity={1.65} color="#fff3d0" />
    <XRMovement />
    <Cabin visible={mode === 'cabin'} />
    <Annotations visible={annotations} />
    <OrbitControls enableDamping dampingFactor={0.06} minDistance={4.6} maxDistance={15} target={[0, 0, 0]} />
  </>
}
