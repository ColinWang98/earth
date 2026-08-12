import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'

type Props = {
  annotations: boolean
}

const DAY_MAP = `${import.meta.env.BASE_URL}assets/earth-day-real.jpg`
const NIGHT_MAP = `${import.meta.env.BASE_URL}assets/earth-night.png`
const NORMAL_MAP = `${import.meta.env.BASE_URL}assets/earth-normal.jpg`
const SPECULAR_MAP = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const CLOUD_MAP = `${import.meta.env.BASE_URL}assets/earth-clouds-real.jpg`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`
const SUN_MAP = `${import.meta.env.BASE_URL}assets/sun-real.jpg`
const STAR_MAP = `${import.meta.env.BASE_URL}assets/stars-milky-way.jpg`
const SUN_POSITION = new THREE.Vector3(30, 16, 20)
const MOON_POSITION: [number, number, number] = [-14, 4, -8]

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
        <meshPhongMaterial map={day} emissiveMap={night} emissive={new THREE.Color('#cfe9ff')} emissiveIntensity={0.16} normalMap={normal} normalScale={new THREE.Vector2(0.62, 0.62)} specularMap={specular} specular={new THREE.Color('#4f7d91')} shininess={8} />
      </mesh>
      <mesh ref={clouds}>
        <sphereGeometry args={[2.29, 72, 72]} />
        <meshPhongMaterial map={cloud} transparent opacity={0.32} depthWrite={false} color="#d8e5ee" />
      </mesh>
    </group>
  )
}

function Moon() {
  const moon = useRef<THREE.Mesh>(null)
  const map = useTexture(MOON_MAP)
  useFrame((_, delta) => { if (moon.current) moon.current.rotation.y += delta * 0.01 })
  return <mesh ref={moon} position={MOON_POSITION}><sphereGeometry args={[0.58, 64, 64]} /><meshStandardMaterial map={map} roughness={1} /></mesh>
}

function Sun() {
  const glow = useRef<THREE.Mesh>(null)
  const map = useTexture(SUN_MAP)
  useFrame((_, delta) => { if (glow.current) glow.current.scale.setScalar(1 + Math.sin(performance.now() * 0.001) * 0.025 + delta * 0) })
  return <group position={SUN_POSITION}>
    <pointLight color="#fff0c4" intensity={560} distance={0} />
    <mesh><sphereGeometry args={[3.4, 64, 64]} /><meshBasicMaterial map={map} color="#fff8dc" /></mesh>
    <mesh ref={glow}><sphereGeometry args={[3.8, 64, 64]} /><meshBasicMaterial color="#ff9a32" transparent opacity={0.075} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
  </group>
}

function DeepSpace() {
  const map = useTexture(STAR_MAP)
  return <mesh>
    <sphereGeometry args={[180, 64, 40]} />
    <meshBasicMaterial map={map} side={THREE.BackSide} toneMapped={false} />
  </mesh>
}

const labels = [
  { position: [-1.9, -1.9, 0.7] as [number, number, number], title: '昼夜分界线', sub: 'Terminator line' },
  { position: [-14, 4.9, -8] as [number, number, number], title: '月球', sub: 'The Moon · 7× Earth radius' },
  { position: [30, 20.2, 20] as [number, number, number], title: '太阳', sub: 'Sun · 17× Earth radius' },
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
  return <group ref={world}><Earth /><Moon /><Sun /></group>
}

export function Scene({ annotations }: Props) {
  useEffect(() => { document.title = 'Earth Observation / 自由太空观察' }, [])
  return <>
    <color attach="background" args={['#02050c']} />
    <ambientLight intensity={0.035} />
    <directionalLight position={SUN_POSITION} intensity={1.65} color="#fff3d0" />
    <DeepSpace />
    <XRMovement />
    <Annotations visible={annotations} />
    <OrbitControls enableDamping dampingFactor={0.06} minDistance={4.6} maxDistance={15} target={[0, 0, 0]} />
  </>
}
