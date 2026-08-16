import { MAX_SIMULATION_TIME, MIN_SIMULATION_TIME } from './astro'

export type ScaleMode = 'earth' | 'solar' | 'stellar'

export interface SimulationState {
  utcMs: number
  paused: boolean
  rate: number
  mode: ScaleMode
  selectedObjectId?: string
}

export const SCALE_MODES: ReadonlyArray<{ id: ScaleMode; label: string; englishLabel: string }> = [
  { id: 'earth', label: '地球观察', englishLabel: 'EARTH' },
  { id: 'solar', label: '太阳系', englishLabel: 'SOLAR SYSTEM' },
  { id: 'stellar', label: '恒星邻域', englishLabel: 'STELLAR NEIGHBOURHOOD' },
]

export const PLAYBACK_RATES = [-86_400, -3_600, 0, 3_600, 86_400, 2_592_000] as const

export function formatDateInput(utcMs: number) {
  return new Date(utcMs).toISOString().slice(0, 10)
}

export function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const utcMs = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(utcMs) || utcMs < MIN_SIMULATION_TIME || utcMs > MAX_SIMULATION_TIME) return null
  return utcMs
}
