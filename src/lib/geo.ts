import type { Geometry, Position } from 'geojson';
import type { MapFeature } from './types.js';

export function shiftAlaska(feature: MapFeature): MapFeature {
	if (feature.properties.postal !== 'AK' || !feature.geometry) return feature;
	if (feature.geometry.type === 'GeometryCollection') return feature;
	return { ...feature, geometry: shiftGeometry(feature.geometry) };
}

function shiftGeometry(geometry: Exclude<Geometry, { type: 'GeometryCollection' }>): Geometry {
	const shift = (pair: Position): Position => [pair[0] > 0 ? pair[0] - 360 : pair[0], pair[1]];
	const walk = (coordinates: Position | Position[] | Position[][] | Position[][][]): unknown =>
		typeof coordinates[0] === 'number'
			? shift(coordinates as Position)
			: (coordinates as Position[]).map((item) => walk(item as Position));
	return {
		type: geometry.type,
		coordinates: walk(geometry.coordinates)
	} as Geometry;
}
