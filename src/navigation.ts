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
  autopilotTargetId?: string
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

export function autopilotDuration(distanceToTargetAu: number) {
  if (distanceToTargetAu <= 0.001) return 4
  return Math.min(12, 4 + Math.log10(distanceToTargetAu / 0.001) * 2)
}

export function movingAutopilotPosition(start: AuVector, target: AuVector, approach: AuVector, standoffAu: number, progress: number): AuVector {
  const linear = Math.min(1, Math.max(0, progress))
  const eased = linear * linear * linear * (linear * (linear * 6 - 15) + 10)
  return [
    start[0] + (target[0] + approach[0] * standoffAu - start[0]) * eased,
    start[1] + (target[1] + approach[1] * standoffAu - start[1]) * eased,
    start[2] + (target[2] + approach[2] * standoffAu - start[2]) * eased,
  ]
}
