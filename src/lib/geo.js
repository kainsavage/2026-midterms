export function shiftAlaska(feature) {
  if (!feature || feature.properties?.postal !== 'AK') return feature
  return { ...feature, geometry: shiftGeometry(feature.geometry) }
}

function shiftGeometry(geometry) {
  if (!geometry) return geometry
  const shift = (pair) => [pair[0] > 0 ? pair[0] - 360 : pair[0], pair[1]]
  const walk = (coordinates) => (typeof coordinates[0] === 'number' ? shift(coordinates) : coordinates.map(walk))
  return { type: geometry.type, coordinates: walk(geometry.coordinates) }
}
