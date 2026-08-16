import { describe, expect, it } from 'vitest'
import * as simulation from './simulation'
import { formatDateInput, parseDateInput } from './simulation'

describe('unified scene state', () => {
  it('does not expose public scale modes', () => {
    expect('SCALE_MODES' in simulation).toBe(false)
  })
})

describe('date input', () => {
  it('round trips a UTC calendar date', () => {
    const value = Date.UTC(2026, 7, 16, 12, 30)
    expect(parseDateInput(formatDateInput(value))).toBe(Date.UTC(2026, 7, 16))
  })

  it('rejects dates outside the simulation range', () => {
    expect(parseDateInput('1899-12-31')).toBeNull()
    expect(parseDateInput('2101-01-01')).toBeNull()
    expect(parseDateInput('not-a-date')).toBeNull()
  })
})
