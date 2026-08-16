export interface KeplerOrbit {
  epochJd: number
  semiMajorAu: number
  eccentricity: number
  inclinationDeg: number
  ascendingNodeDeg: number
  argumentOfPerihelionDeg: number
  meanAnomalyDeg: number
}

export function propagateKeplerOrbit(orbit: KeplerOrbit, julianDay: number): [number, number, number] {
  const radians = Math.PI / 180
  const dailyMotion = 0.01720209895 / Math.pow(orbit.semiMajorAu, 1.5)
  let meanAnomaly = orbit.meanAnomalyDeg * radians + dailyMotion * (julianDay - orbit.epochJd)
  meanAnomaly %= Math.PI * 2
  let eccentricAnomaly = meanAnomaly
  for (let iteration = 0; iteration < 10; iteration += 1) {
    eccentricAnomaly -= (eccentricAnomaly - orbit.eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - orbit.eccentricity * Math.cos(eccentricAnomaly))
  }
  const orbitalX = orbit.semiMajorAu * (Math.cos(eccentricAnomaly) - orbit.eccentricity)
  const orbitalY = orbit.semiMajorAu * Math.sqrt(1 - orbit.eccentricity * orbit.eccentricity) * Math.sin(eccentricAnomaly)
  const node = orbit.ascendingNodeDeg * radians
  const inclination = orbit.inclinationDeg * radians
  const perihelion = orbit.argumentOfPerihelionDeg * radians
  const cosNode = Math.cos(node), sinNode = Math.sin(node)
  const cosInclination = Math.cos(inclination), sinInclination = Math.sin(inclination)
  const cosPerihelion = Math.cos(perihelion), sinPerihelion = Math.sin(perihelion)
  const x = (cosNode * cosPerihelion - sinNode * sinPerihelion * cosInclination) * orbitalX + (-cosNode * sinPerihelion - sinNode * cosPerihelion * cosInclination) * orbitalY
  const y = (sinNode * cosPerihelion + cosNode * sinPerihelion * cosInclination) * orbitalX + (-sinNode * sinPerihelion + cosNode * cosPerihelion * cosInclination) * orbitalY
  const z = sinPerihelion * sinInclination * orbitalX + cosPerihelion * sinInclination * orbitalY
  return [x, y, z]
}
