import { describe, expect, it } from 'vitest'
import { starAppearance } from './starAppearance'

describe('star appearance', () => {
  it('makes brighter catalogue stars larger and more opaque', () => {
    const bright = starAppearance(-1.4, 'desktop')
    const dim = starAppearance(6.4, 'desktop')
    expect(bright.sizePx).toBeGreaterThan(dim.sizePx)
    expect(bright.opacity).toBeGreaterThan(dim.opacity)
  })

  it('keeps desktop and mobile stars within visible point-size budgets', () => {
    const desktopDim = starAppearance(6.5, 'desktop')
    const desktopBright = starAppearance(-1.5, 'desktop')
    const mobileDim = starAppearance(6.5, 'mobile')
    const mobileBright = starAppearance(-1.5, 'mobile')
    expect(desktopDim.sizePx).toBeGreaterThanOrEqual(1.4)
    expect(desktopBright.sizePx).toBeLessThanOrEqual(3.9)
    expect(mobileDim.sizePx).toBeGreaterThanOrEqual(1.15)
    expect(mobileBright.sizePx).toBeLessThanOrEqual(3.1)
  })
})
