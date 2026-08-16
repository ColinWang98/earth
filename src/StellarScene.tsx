import { useEffect, useMemo, useRef, useState } from 'react'
import { OrbitControls, Text } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecodedGaiaCatalog } from './starCatalog'

export type StellarSelection = {
  id: string
  label: string
  distancePc: number
  radialVelocityKnown: boolean
  position: [number, number, number]
}

type Shell = { id: string; catalog: DecodedGaiaCatalog }
type Props = {
  utcMs: number
  quality: 'desktop' | 'mobile'
  selectedObjectId?: string
  onSelect: (selection: StellarSelection) => void
  onStatus: (status: string) => void
}

function StellarShell({ shell, elapsedYears, selectedObjectId, onSelect }: { shell: Shell, elapsedYears: number, selectedObjectId?: string, onSelect: Props['onSelect'] }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(shell.catalog.positions, 3))
    next.setAttribute('velocity', new THREE.BufferAttribute(shell.catalog.velocities, 3))
    next.setAttribute('color', new THREE.BufferAttribute(shell.catalog.colors, 3))
    next.setAttribute('magnitude', new THREE.BufferAttribute(shell.catalog.magnitudes, 1))
    return next
  }, [shell])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => { if (material.current) material.current.uniforms.uYears.value = elapsedYears }, [elapsedYears])

  const selectedIndex = selectedObjectId ? shell.catalog.sourceIds.indexOf(selectedObjectId) : -1
  const selectedPosition = useMemo(() => {
    if (selectedIndex < 0) return null
    const offset = selectedIndex * 3
    return new THREE.Vector3(
      shell.catalog.positions[offset] + shell.catalog.velocities[offset] * elapsedYears,
      shell.catalog.positions[offset + 2] + shell.catalog.velocities[offset + 2] * elapsedYears,
      -(shell.catalog.positions[offset + 1] + shell.catalog.velocities[offset + 1] * elapsedYears),
    )
  }, [elapsedYears, selectedIndex, shell])

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    const index = event.index
    if (index == null) return
    const offset = index * 3
    const x = shell.catalog.positions[offset] + shell.catalog.velocities[offset] * elapsedYears
    const y = shell.catalog.positions[offset + 1] + shell.catalog.velocities[offset + 1] * elapsedYears
    const z = shell.catalog.positions[offset + 2] + shell.catalog.velocities[offset + 2] * elapsedYears
    const id = shell.catalog.sourceIds[index]
    onSelect({ id, label: `Gaia ${id}`, distancePc: Math.hypot(x, y, z), radialVelocityKnown: (shell.catalog.qualityFlags[index] & 1) === 0, position: [x, z, -y] })
  }

  return <>
    <points geometry={geometry} frustumCulled={false} onClick={handleClick}>
      <shaderMaterial ref={material} transparent depthWrite={false} blending={THREE.AdditiveBlending} vertexColors uniforms={{ uYears: { value: elapsedYears }, uPointScale: { value: shell.id === 'near' ? 0.9 : 0.64 } }} vertexShader={`
        uniform float uYears; uniform float uPointScale;
        attribute vec3 velocity; attribute float magnitude;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec3 propagated = position + velocity * uYears;
          vec3 mapped = vec3(propagated.x, propagated.z, -propagated.y);
          vec4 view = modelViewMatrix * vec4(mapped, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp((8.5 - magnitude) * uPointScale, 1.0, 7.0);
          vColor = color;
          vAlpha = clamp((9.0 - magnitude) / 8.0, 0.18, 0.95);
        }
      `} fragmentShader={`
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float disc = smoothstep(0.5, 0.05, length(point));
          gl_FragColor = vec4(vColor, vAlpha * disc);
        }
      `} />
    </points>
    {selectedPosition && <group position={selectedPosition}>
      <mesh><sphereGeometry args={[0.12, 16, 12]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <Text fontSize={0.25} color="#ffffff" anchorX="left" position={[0.22, 0.12, 0]}>{`Gaia ${selectedObjectId}`}</Text>
    </group>}
  </>
}

export default function StellarScene({ utcMs, quality, selectedObjectId, onSelect, onStatus }: Props) {
  const [shells, setShells] = useState<Shell[]>([])
  const { camera } = useThree()
  const elapsedYears = new Date(utcMs).getUTCFullYear() + new Date(utcMs).getUTCMonth() / 12 - 2016

  useEffect(() => {
    camera.position.set(0, 4, 18)
    camera.near = 0.01
    camera.far = 140
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  useEffect(() => {
    const worker = new Worker(new URL('./gaia.worker.ts', import.meta.url), { type: 'module' })
    onStatus('正在加载 Gaia 三维邻星…')
    worker.onmessage = (event: MessageEvent<{ type: string; id?: string; catalog?: DecodedGaiaCatalog; message?: string }>) => {
      if (event.data.type === 'shell' && event.data.id && event.data.catalog) {
        setShells((current) => [...current.filter((shell) => shell.id !== event.data.id), { id: event.data.id!, catalog: event.data.catalog! }])
      }
      if (event.data.type === 'ready') onStatus(`Gaia DR3 · ${quality === 'desktop' ? '100' : '50'} pc LOD 已就绪`)
      if (event.data.type === 'error') onStatus(`Gaia 数据不可用 · ${event.data.message ?? '未知错误'}`)
    }
    worker.postMessage({ quality })
    return () => worker.terminate()
  }, [onStatus, quality])

  return <>
    <color attach="background" args={['#010207']} />
    <ambientLight intensity={0.12} />
    <mesh><sphereGeometry args={[0.09, 24, 16]} /><meshBasicMaterial color="#ffd36a" /></mesh>
    <Text position={[0.16, 0.08, 0]} fontSize={0.18} color="#ffdca1" anchorX="left">太阳 · Sun</Text>
    {shells.map((shell) => <StellarShell key={shell.id} shell={shell} elapsedYears={elapsedYears} selectedObjectId={selectedObjectId} onSelect={onSelect} />)}
    <gridHelper args={[200, 20, '#19334a', '#0c1b2a']} position={[0, -0.02, 0]} />
    <Text position={[6, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.2} color="#58738b">10 pc</Text>
    <OrbitControls enableDamping dampingFactor={0.07} minDistance={0.2} maxDistance={115} target={[0, 0, 0]} />
  </>
}
