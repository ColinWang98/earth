export function percentile95(samples: readonly number[]) {
  if (!samples.length) return null
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}
