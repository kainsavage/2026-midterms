import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type Office = 'house' | 'senate' | 'governor';
export type ShadeMode = 'winner' | 'margin';

export interface Candidate {
	name: string;
	party: string;
	bucket: string;
	votes: number;
	percent: number | null;
	winner?: boolean;
}

export interface DistrictPresident {
	demVotes: number;
	repVotes: number;
	otherVotes: number;
	totalVotes: number;
	demMargin: number | null;
	winner: string | null;
	lines?: string;
	candidates: Candidate[];
}

export interface HistoricalRace {
	uncontested?: boolean;
	special?: boolean;
	demVotes: number;
	repVotes: number;
	otherVotes: number;
	totalVotes: number;
	demMargin: number | null;
	winner: string | null;
	party: string | null;
	bucket: string;
	candidates: Candidate[];
}

export interface StatewideRace {
	office: string;
	status: string;
	called: boolean;
	leader: string | null;
	party: string;
	bucket: string;
	demVotes: number;
	repVotes: number;
	otherVotes: number;
	totalVotes: number;
	demMargin: number | null;
	percentReporting: number | null;
	updatedUtc: string | null;
	url: string | null;
	candidates: Candidate[];
	swingVsPresident: number | null;
}

export interface District {
	id: string;
	state: string;
	district: number;
	name: string;
	status: string;
	called: boolean;
	leader: string | null;
	party: string;
	bucket: string;
	demVotes: number;
	repVotes: number;
	otherVotes: number;
	totalVotes: number;
	demMargin: number | null;
	percentReporting: number | null;
	votesLeft: number | null;
	incumbent: string | null;
	incumbentParty: string | null;
	incumbentResult: string | null;
	flip: boolean;
	linesChanged: boolean;
	url: string | null;
	updatedUtc: string | null;
	candidates: Candidate[];
	house2024: HistoricalRace | null;
	pollingHouse2024Margin: number | null;
	presidentOnLines: number | null;
	president2024: DistrictPresident | null;
	swing: number | null;
	swingVsPresident: number | null;
}

export interface SeatCount {
	dem: number;
	rep: number;
	other: number;
	uncalled: number;
}

export interface VoteCount {
	dem: number;
	rep: number;
	other: number;
	total: number;
	demMargin: number | null;
}

export interface StateRecord {
	postal: string;
	name: string;
	fips: string;
	linesChanged: boolean;
	houseSeats: SeatCount;
	houseVotes: VoteCount;
	senate2026: StatewideRace | null;
	governor2026: StatewideRace | null;
	president2024: HistoricalRace | null;
	senate2024: HistoricalRace[];
}

export interface ElectionSources {
	generatedAt: string;
	resultsUpdatedUtc: string;
	unofficial: boolean;
	districtVintage: string;
	districtSource: string;
	stateSource: string;
	resultsSource: string;
	historySource: string;
}

export interface ElectionData {
	sources: ElectionSources;
	states: Record<string, StateRecord>;
	districts: Record<string, District>;
}

export type Selection =
	| { type: 'district'; place: District; state: StateRecord }
	| { type: 'house-state'; place: StateRecord; districts: District[] }
	| {
			type: 'state';
			office: 'senate' | 'governor';
			place: StateRecord;
			race: StatewideRace | null;
	  };

export interface MapProperties {
	postal?: string;
	name?: string;
	id?: string;
}

export type MapFeature = Feature<Geometry, MapProperties>;
export type MapCollection = FeatureCollection<Geometry, MapProperties>;
