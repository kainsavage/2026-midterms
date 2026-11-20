import type { ElectionData, MapCollection } from './types.js';
import electionJson from './data/election.json';
import statesJson from './data/states.json';

const districtModules = import.meta.glob<{ default: MapCollection }>('./data/districts/*.json', {
	eager: true
});

const districtsGeo: Record<string, MapCollection> = {};
for (const [file, mod] of Object.entries(districtModules)) {
	const postal = file.replaceAll('\\', '/').match(/([A-Z]{2})\.json$/)?.[1];
	if (postal) districtsGeo[postal] = mod.default;
}

const empty: MapCollection = { type: 'FeatureCollection', features: [] };

export function districtsFor(postal: string) {
	return districtsGeo[postal] ?? empty;
}

export const election = electionJson as unknown as ElectionData;
export const statesGeo = statesJson as MapCollection;
