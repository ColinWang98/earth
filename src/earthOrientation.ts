import { SiderealTime } from 'astronomy-engine'
import { clampSimulationTime, getEarthFixedSunDirection } from './astro'

export type Vector3Tuple = [number, number, number]

export const EARTH_AXIAL_TILT_RAD = -23.4392911 * Math.PI / 180

export function earthRotationAngleRad(utcMs: number) {
  return SiderealTime(new Date(clampSimulationTime(utcMs))) * Math.PI / 12
}

export function earthLocalToInertial(vector: Vector3Tuple, utcMs: number): Vector3Tuple {
  const spin = earthRotationAngleRad(utcMs)
  const spinCos = Math.cos(spin)
  const spinSin = Math.sin(spin)
  const spunX = spinCos * vector[0] + spinSin * vector[2]
  const spunY = vector[1]
  const spunZ = -spinSin * vector[0] + spinCos * vector[2]
  const tiltCos = Math.cos(EARTH_AXIAL_TILT_RAD)
  const tiltSin = Math.sin(EARTH_AXIAL_TILT_RAD)
  return [
    spunX,
    tiltCos * spunY - tiltSin * spunZ,
    tiltSin * spunY + tiltCos * spunZ,
  ]
}

export function getEarthInertialSunDirection(utcMs: number): Vector3Tuple {
  return earthLocalToInertial(getEarthFixedSunDirection(utcMs), utcMs)
}
