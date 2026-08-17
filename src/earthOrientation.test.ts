import { describe, expect, it } from 'vitest'
import { getEarthFixedSunDirection } from './astro'
import {
  EARTH_AXIAL_TILT_RAD,
  earthLocalToInertial,
  earthRotationAngleRad,
  getEarthInertialSunDirection,
} from './earthOrientation'

const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12)
const SIDEREAL_DAY_MS = 86_164.0905 * 1_000

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function wrappedAngleDistance(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

describe('Earth inertial orientation', () => {
  it('uses the J2000 mean obliquity and Astronomy Engine sidereal angle', () => {
    expect(EARTH_AXIAL_TILT_RAD).toBeCloseTo(-23.4392911 * Math.PI / 180, 12)
    expect(earthRotationAngleRad(J2000_UTC_MS)).toBeCloseTo(18.697136303 * Math.PI / 12, 7)
  })

  it('returns to the same spin orientation after one sidereal day', () => {
    const start = earthRotationAngleRad(J2000_UTC_MS)
    const end = earthRotationAngleRad(J2000_UTC_MS + SIDEREAL_DAY_MS)
    expect(wrappedAngleDistance(start, end)).toBeLessThan(2e-5)
  })

  it('preserves geographic solar incidence when moved into the inertial frame', () => {
    const utcMs = Date.UTC(2026, 7, 17, 8, 30)
    const localNormal: [number, number, number] = [0.36, 0.48, 0.8]
    const fixedSun = getEarthFixedSunDirection(utcMs)
    const worldNormal = earthLocalToInertial(localNormal, utcMs)
    const inertialSun = getEarthInertialSunDirection(utcMs)
    expect(dot(worldNormal, inertialSun)).toBeCloseTo(dot(localNormal, fixedSun), 12)
  })
})
