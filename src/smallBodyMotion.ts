import { clampSimulationTime } from './astro'

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
