function physicalParameter(payload, name) {
  return payload.phys_par?.find((parameter) => parameter.name === name)?.value
}

function parsePole(value) {
  const [ra, dec] = String(value ?? '').split('/').map(Number)
  return Number.isFinite(ra) && Number.isFinite(dec) ? [ra, dec] : undefined
}

function parseAxisRatios(value, fallback) {
  const dimensions = String(value ?? '').match(/[0-9]+(?:\.[0-9]+)?/g)?.map(Number).filter((entry) => Number.isFinite(entry) && entry > 0) ?? []
  if (dimensions.length === 2) dimensions.push(dimensions[1])
  const resolved = dimensions.length >= 3 ? dimensions.slice(0, 3) : fallback
  const largest = Math.max(...resolved)
  return resolved.map((entry) => entry / largest)
}

export function parseSmallBody(payload, label, presentation = {}) {
  const elements = Object.fromEntries(payload.orbit.elements.map((element) => [element.name, Number(element.value)]))
  const required = ['a', 'e', 'i', 'om', 'w', 'ma']
  if (!required.every((name) => Number.isFinite(elements[name]))) throw new Error(`Incomplete orbit for ${payload.object.fullname}`)
  const jplRotation = Number(physicalParameter(payload, 'rot_per'))
  const jplPole = parsePole(physicalParameter(payload, 'pole'))
  const fallbackPole = presentation.fallbackPole ?? [0, 90]
  return {
    id: payload.object.spkid,
    label,
    englishLabel: payload.object.fullname,
    epochJd: Number(payload.orbit.epoch),
    semiMajorAu: elements.a,
    eccentricity: elements.e,
    inclinationDeg: elements.i,
    ascendingNodeDeg: elements.om,
    argumentOfPerihelionDeg: elements.w,
    meanAnomalyDeg: elements.ma,
    rotationPeriodHours: Number.isFinite(jplRotation) && jplRotation > 0 ? jplRotation : presentation.fallbackRotationHours,
    rotationSource: Number.isFinite(jplRotation) && jplRotation > 0 ? 'jpl' : 'illustrative',
    poleRaDeg: (jplPole ?? fallbackPole)[0],
    poleDecDeg: (jplPole ?? fallbackPole)[1],
    axisSource: jplPole ? 'jpl' : 'illustrative',
    axisRatios: parseAxisRatios(physicalParameter(payload, 'extent'), presentation.fallbackAxisRatios ?? [1, 0.72, 0.58]),
    ...(presentation.shapeModel ? { shapeModel: presentation.shapeModel } : {}),
  }
}
