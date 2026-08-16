export function parseSmallBody(payload, label) {
  const elements = Object.fromEntries(payload.orbit.elements.map((element) => [element.name, Number(element.value)]))
  const required = ['a', 'e', 'i', 'om', 'w', 'ma']
  if (!required.every((name) => Number.isFinite(elements[name]))) throw new Error(`Incomplete orbit for ${payload.object.fullname}`)
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
  }
}
