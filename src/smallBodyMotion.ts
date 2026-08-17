import { clampSimulationTime } from './astro'
import { compressedRenderDistance, type AuVector } from './navigation'
import { propagateKeplerOrbit, type KeplerOrbit } from './orbits'

const J2000_MS = Date.UTC(2000, 0, 1, 12)
const OBLIQUITY_RAD = 23.4392911 * Math.PI / 180

export function frameSimulationUtcMs(anchorUtcMs: number, anchorRealMs: number, frameRealMs: number, rate: number, paused: boolean) {
  if (paused) return anchorUtcMs
  return clampSimulationTime(anchorUtcMs + (frameRealMs - anchorRealMs) * rate)
}

export function poleDirectionThree(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  const equatorialX = Math.cos(dec) * Math.cos(ra)
  const equatorialY = Math.cos(dec) * Math.sin(ra)
  const equatorialZ = Math.sin(dec)
  const eclipticY = Math.cos(OBLIQUITY_RAD) * equatorialY + Math.sin(OBLIQUITY_RAD) * equatorialZ
  const eclipticZ = -Math.sin(OBLIQUITY_RAD) * equatorialY + Math.cos(OBLIQUITY_RAD) * equatorialZ
  const length = Math.hypot(equatorialX, eclipticY, eclipticZ) || 1
  return [equatorialX / length, eclipticZ / length, -eclipticY / length]
}

export function spinAngleRad(utcMs: number, rotationPeriodHours: number) {
  if (!Number.isFinite(rotationPeriodHours) || rotationPeriodHours <= 0) return 0
  const turns = (utcMs - J2000_MS) / (rotationPeriodHours * 3_600_000)
  return ((turns % 1) + 1) % 1 * Math.PI * 2
}

export function writeSmallBodyRenderPosition(orbit: KeplerOrbit, observer: AuVector, utcMs: number, target: { set: (x: number, y: number, z: number) => unknown }) {
  const julianDay = utcMs / 86_400_000 + 2_440_587.5
  const position = propagateKeplerOrbit(orbit, julianDay)
  const x = position[0] - observer[0]
  const y = position[1] - observer[1]
  const z = position[2] - observer[2]
  const distance = Math.hypot(x, y, z)
  const inverse = distance > 0 ? compressedRenderDistance(distance) * 900 / distance : 0
  target.set(x * inverse, z * inverse, -y * inverse)
}
