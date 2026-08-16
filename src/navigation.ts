import type { CelestialBodyState } from './astro'

export type AuVector = [number, number, number]
export type ControlMode = 'orbit' | 'flight'
export type SpaceBand = 'surface' | 'orbital' | 'solar'

export interface NavigationState {
  controlMode: ControlMode
  observerHelioAu: AuVector
  orientation: [number, number, number, number]
  speedAuPerSecond: number
  band: SpaceBand
}

export function effectiveObserverPosition(navigation: NavigationState, earthPositionAu: AuVector, orbitStandoffAu: number): AuVector {
  if (navigation.controlMode === 'flight') return navigation.observerHelioAu
  return [earthPositionAu[0], earthPositionAu[1] - orbitStandoffAu, earthPositionAu[2]]
}

export function distanceAu(left: AuVector, right: AuVector) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

export function nearestBody<T extends Pick<CelestialBodyState, 'id' | 'positionAu' | 'radiusKm'>>(observer: AuVector, bodies: T[]): T & { distanceAu: number } {
  if (!bodies.length) throw new Error('At least one celestial body is required')
  let nearest = bodies[0]
  let nearestDistance = distanceAu(observer, nearest.positionAu)
  for (let index = 1; index < bodies.length; index += 1) {
    const candidateDistance = distanceAu(observer, bodies[index].positionAu)
    if (candidateDistance < nearestDistance) {
      nearest = bodies[index]
      nearestDistance = candidateDistance
    }
  }
  return { ...nearest, distanceAu: nearestDistance }
}

export function compressedRenderDistance(valueAu: number) {
  const distance = Math.max(0, valueAu)
  if (distance <= 0.001) return distance
  return 0.001 + Math.log1p((distance - 0.001) * 200) / 200
}

export function adaptiveFlightSpeed(nearestDistanceAu: number) {
  return Math.min(0.08, Math.max(0.00000002, nearestDistanceAu * 0.001))
}

export function selectSpaceBand(nearestDistanceAu: number): SpaceBand {
  if (nearestDistanceAu < 0.005) return 'surface'
  if (nearestDistanceAu < 0.05) return 'orbital'
  return 'solar'
}
