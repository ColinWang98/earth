import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'

type Props = {
  annotations: boolean
}

const DAY_MAP = `${import.meta.env.BASE_URL}assets/earth-blue-marble-5k.jpg`
const NIGHT_MAP = `${import.meta.env.BASE_URL}assets/earth-night.png`
const NORMAL_MAP = `${import.meta.env.BASE_URL}assets/earth-normal.jpg`
const SPECULAR_MAP = `${import.meta.env.BASE_URL}assets/earth-specular.jpg`
const CLOUD_MAP = `${import.meta.env.BASE_URL}assets/earth-clouds-real.jpg`
const MOON_MAP = `${import.meta.env.BASE_URL}assets/moon.jpg`
const STAR_MAP = `${import.meta.env.BASE_URL}assets/nasa-wise-all-sky.jpg`
const LIGHT_POSITION = new THREE.Vector3(3, 4, 30)
const MOON_POSITION: [number, number, number] = [-22, 8, -16]

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
        <sphereGeometry args={[2.25, 128, 128]} />
        <meshPhongMaterial map={day} color="#f7fbff" emissiveMap={night} emissive={new THREE.Color('#d9edff')} emissiveIntensity={0.24} normalMap={normal} normalScale={new THREE.Vector2(0.48, 0.48)} specularMap={specular} specular={new THREE.Color('#81b5cf')} shininess={12} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.253, 128, 128]} />
        <meshBasicMaterial map={day} transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.256, 128, 128]} />
        <meshBasicMaterial color="#2f78b5" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <mesh ref={clouds}>
        <sphereGeometry args={[2.29, 72, 72]} />
        <meshPhongMaterial map={cloud} transparent opacity={0.24} depthWrite={false} color="#e4f1f8" />
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

function DeepSpace() {
  const map = useTexture(STAR_MAP)
  return <mesh>
    <sphereGeometry args={[180, 64, 40]} />
    <meshBasicMaterial map={map} color="#27313d" side={THREE.BackSide} toneMapped={false} />
  </mesh>
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
      if (source.handedness === 'right') orbit.current.distance = THREE.MathUtils.clamp(orbit.current.distance + axes[3] * delta * 2.1, 2.7, 15)
    }
    const { theta, phi, distance } = orbit.current
    world.current.position.set(-Math.sin(theta) * Math.cos(phi) * distance, -Math.sin(phi) * distance + 0.25, -Math.cos(theta) * Math.cos(phi) * distance)
  })
  return <group ref={world}><Earth /><Moon /></group>
}

export function Scene({ annotations }: Props) {
  useEffect(() => { document.title = 'Earth Observation / 自由太空观察' }, [])
  return <>
    <color attach="background" args={['#02050c']} />
    <ambientLight intensity={0.4} color="#d3e8fa" />
    <directionalLight position={LIGHT_POSITION} intensity={2.2} color="#fff7df" />
    <DeepSpace />
    <XRMovement />
    <Annotations visible={annotations} />
    <OrbitControls enableDamping dampingFactor={0.06} minDistance={2.7} maxDistance={15} target={[0, 0, 0]} />
  </>
}
