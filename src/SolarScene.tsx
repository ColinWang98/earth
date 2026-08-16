import { useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getSolarSystemSnapshot, type CelestialBodyState } from './astro'
import { propagateKeplerOrbit, type KeplerOrbit } from './orbits'

type Props = {
  utcMs: number
  selectedObjectId?: string
  trueScale: boolean
  showSmallBodies: boolean
  quality: 'desktop' | 'mobile'
  onSelect: (id: string) => void
}
type SmallBody = KeplerOrbit & { id: string; label: string; englishLabel: string }

const SCENE_AU = 1.45
const ORBITS = [
  ['mercury', 0.387, 0.206], ['venus', 0.723, 0.007], ['earth', 1, 0.017], ['mars', 1.524, 0.093],
  ['jupiter', 5.203, 0.049], ['saturn', 9.537, 0.057], ['uranus', 19.191, 0.046], ['neptune', 30.069, 0.011],
] as const

function OrbitPath({ semiMajorAu, eccentricity, quality }: { semiMajorAu: number, eccentricity: number, quality: Props['quality'] }) {
  const geometry = useMemo(() => {
    const segments = quality === 'desktop' ? 160 : 96
    const positions = new Float32Array(segments * 3)
    const semiMinor = semiMajorAu * Math.sqrt(1 - eccentricity * eccentricity)
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2
      positions.set([(Math.cos(angle) * semiMajorAu - semiMajorAu * eccentricity) * SCENE_AU, 0, Math.sin(angle) * semiMinor * SCENE_AU], index * 3)
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return next
  }, [eccentricity, quality, semiMajorAu])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineLoop geometry={geometry}><lineBasicMaterial color="#28445f" transparent opacity={0.42} /></lineLoop>
}

function SolarBody({ body, selected, trueScale, onSelect }: { body: CelestialBodyState, selected: boolean, trueScale: boolean, onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(body.positionAu[0] * SCENE_AU, body.positionAu[2] * SCENE_AU, -body.positionAu[1] * SCENE_AU), [body.positionAu])
  useFrame((_, delta) => group.current?.position.lerp(target, 1 - Math.exp(-delta * 7)))
  const radiusAu = body.radiusKm / 149_597_870.7 * SCENE_AU
  const visualRadius = body.id === 'sun' ? 0.42 : 0.055 + Math.log10(body.radiusKm / 2_000 + 1) * 0.055
  const radius = trueScale ? radiusAu : visualRadius
  const labelVisible = selected || ['sun', 'earth', 'mars', 'jupiter', 'saturn', 'neptune'].includes(body.id)

  return <group ref={group} position={target}>
    <mesh onClick={(event) => { event.stopPropagation(); onSelect(body.id) }}>
      <sphereGeometry args={[Math.max(radius, 0.00002), 32, 24]} />
      <meshStandardMaterial color={body.color} roughness={body.id === 'sun' ? 0.7 : 0.88} emissive={body.id === 'sun' ? body.color : '#000000'} emissiveIntensity={body.id === 'sun' ? 1.7 : 0} />
    </mesh>
    <mesh visible={selected} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.max(visualRadius * 1.35, 0.1), Math.max(visualRadius * 1.45, 0.11), 48]} />
      <meshBasicMaterial color="#9bdcff" transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
    {labelVisible && <Text fontSize={body.id === 'sun' ? 0.22 : 0.14} color={selected ? '#ffffff' : '#9fb7ca'} anchorX="left" position={[Math.max(visualRadius, 0.08) + 0.08, 0.04, 0]}>{body.label}</Text>}
  </group>
}

export default function SolarScene({ utcMs, selectedObjectId, trueScale, showSmallBodies, quality, onSelect }: Props) {
  const snapshot = useMemo(() => getSolarSystemSnapshot(utcMs), [utcMs])
  const [smallBodies, setSmallBodies] = useState<SmallBody[]>([])
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 24, 48)
    camera.near = 0.001
    camera.far = 180
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  useEffect(() => {
    if (!showSmallBodies || smallBodies.length) return
    fetch(`${import.meta.env.BASE_URL}assets/solar/small-bodies.json`).then((response) => response.json()).then((payload: { bodies: SmallBody[] }) => setSmallBodies(payload.bodies)).catch(() => setSmallBodies([]))
  }, [showSmallBodies, smallBodies.length])
  const smallBodyPositions = useMemo(() => {
    const julianDay = utcMs / 86_400_000 + 2_440_587.5
    return smallBodies.map((body) => ({ body, position: propagateKeplerOrbit(body, julianDay) }))
  }, [smallBodies, utcMs])

  return <>
    <color attach="background" args={['#01040a']} />
    <ambientLight intensity={0.24} color="#9eb4d0" />
    <pointLight position={[0, 0, 0]} intensity={quality === 'desktop' ? 5 : 3.8} distance={120} decay={0.35} color="#fff0c2" />
    {ORBITS.map(([id, semiMajorAu, eccentricity]) => <OrbitPath key={id} semiMajorAu={semiMajorAu} eccentricity={eccentricity} quality={quality} />)}
    {snapshot.map((body) => <SolarBody key={body.id} body={body} selected={body.id === selectedObjectId} trueScale={trueScale} onSelect={onSelect} />)}
    {showSmallBodies && smallBodyPositions.map(({ body, position }) => <group key={body.id} position={[position[0] * SCENE_AU, position[2] * SCENE_AU, -position[1] * SCENE_AU]}>
      <mesh><sphereGeometry args={[0.028, 12, 8]} /><meshBasicMaterial color="#e78a43" /></mesh>
      <Text fontSize={0.085} color="#c98b62" anchorX="left" position={[0.05, 0.03, 0]}>{body.label}</Text>
    </group>)}
    <Text fontSize={0.18} color="#6f8ba2" anchorX="left" position={[-14, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>10 AU</Text>
    <OrbitControls enableDamping dampingFactor={0.06} minDistance={0.25} maxDistance={110} target={[0, 0, 0]} />
  </>
}
