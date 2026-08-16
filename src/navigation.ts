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

export interface TargetIndicatorState {
  objectId: string
  onScreen: boolean
  screenPosition: [number, number]
  directionAngleRad: number
  distanceLabel: string
}

export function effectiveObserverPosition(navigation: NavigationState, earthPositionAu: AuVector, orbitStandoffAu: number): AuVector {
  if (navigation.controlMode === 'flight') return navigation.observerHelioAu
  return [earthPositionAu[0], earthPositionAu[1] - orbitStandoffAu, earthPositionAu[2]]
}

export function getTargetIndicatorState(objectId: string, ndc: AuVector, distanceLabel: string): TargetIndicatorState {
  const onScreen = Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1 && ndc[2] >= -1 && ndc[2] <= 1
  if (onScreen) return { objectId, onScreen, screenPosition: [ndc[0], ndc[1]], directionAngleRad: Math.atan2(ndc[1], ndc[0]), distanceLabel }
  const directionX = ndc[2] > 1 ? -ndc[0] : ndc[0]
  const directionY = ndc[2] > 1 ? -ndc[1] : ndc[1]
  const edgeScale = 0.88 / Math.max(Math.abs(directionX), Math.abs(directionY), 0.0001)
  return { objectId, onScreen, screenPosition: [directionX * edgeScale, directionY * edgeScale], directionAngleRad: Math.atan2(directionY, directionX), distanceLabel }
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
