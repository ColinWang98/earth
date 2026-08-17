export type StarQuality = 'desktop' | 'mobile'

export function starAppearance(magnitude: number, quality: StarQuality) {
  const brightness = 1 - Math.min(1, Math.max(0, (magnitude + 1.5) / 8))
  const sizeBase = quality === 'desktop' ? 1.45 : 1.2
  const sizeRange = quality === 'desktop' ? 2.35 : 1.85
  return {
    sizePx: sizeBase + Math.pow(brightness, 1.35) * sizeRange,
    opacity: 0.68 + brightness * 0.3,
  }
}
