export function parseHorizonsVectors(result) {
  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end < 0 || end <= start) throw new Error('Horizons response does not contain vector markers')
  return result.slice(start + 5, end).trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const fields = line.split(',').map((field) => field.trim())
    const vector = fields.slice(2, 5).map(Number)
    if (vector.length !== 3 || vector.some((value) => !Number.isFinite(value))) throw new Error(`Invalid Horizons vector: ${line}`)
    return vector
  })
}

export function angularSeparationArcminutes(left, right) {
  const leftLength = Math.hypot(...left)
  const rightLength = Math.hypot(...right)
  const cosine = left.reduce((sum, value, index) => sum + value * right[index], 0) / (leftLength * rightLength)
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI * 60
}
