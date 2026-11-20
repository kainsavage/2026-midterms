import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import { feature } from 'topojson-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = path.join(root, 'data', 'raw');
const outDir = path.join(root, 'src', 'lib', 'data');
const districtDir = path.join(outDir, 'districts');
const fresh = process.argv.includes('--fresh');

const STATES = [
	['AL', '01', 'Alabama'],
	['AK', '02', 'Alaska'],
	['AZ', '04', 'Arizona'],
	['AR', '05', 'Arkansas'],
	['CA', '06', 'California'],
	['CO', '08', 'Colorado'],
	['CT', '09', 'Connecticut'],
	['DE', '10', 'Delaware'],
	['DC', '11', 'District of Columbia'],
	['FL', '12', 'Florida'],
	['GA', '13', 'Georgia'],
	['HI', '15', 'Hawaii'],
	['ID', '16', 'Idaho'],
	['IL', '17', 'Illinois'],
	['IN', '18', 'Indiana'],
	['IA', '19', 'Iowa'],
	['KS', '20', 'Kansas'],
	['KY', '21', 'Kentucky'],
	['LA', '22', 'Louisiana'],
	['ME', '23', 'Maine'],
	['MD', '24', 'Maryland'],
	['MA', '25', 'Massachusetts'],
	['MI', '26', 'Michigan'],
	['MN', '27', 'Minnesota'],
	['MS', '28', 'Mississippi'],
	['MO', '29', 'Missouri'],
	['MT', '30', 'Montana'],
	['NE', '31', 'Nebraska'],
	['NV', '32', 'Nevada'],
	['NH', '33', 'New Hampshire'],
	['NJ', '34', 'New Jersey'],
	['NM', '35', 'New Mexico'],
	['NY', '36', 'New York'],
	['NC', '37', 'North Carolina'],
	['ND', '38', 'North Dakota'],
	['OH', '39', 'Ohio'],
	['OK', '40', 'Oklahoma'],
	['OR', '41', 'Oregon'],
	['PA', '42', 'Pennsylvania'],
	['RI', '44', 'Rhode Island'],
	['SC', '45', 'South Carolina'],
	['SD', '46', 'South Dakota'],
	['TN', '47', 'Tennessee'],
	['TX', '48', 'Texas'],
	['UT', '49', 'Utah'],
	['VT', '50', 'Vermont'],
	['VA', '51', 'Virginia'],
	['WA', '53', 'Washington'],
	['WV', '54', 'West Virginia'],
	['WI', '55', 'Wisconsin'],
	['WY', '56', 'Wyoming']
];

const POSTAL_BY_FIPS = new Map(STATES.map(([postal, fips]) => [fips, postal]));
const NAME_BY_POSTAL = new Map(STATES.map(([postal, , name]) => [postal, name]));

const SOURCES = {
	houseDistricts: 'https://polling-desk.com/house-districts.csv',
	results: 'https://polling-desk.com/results.csv',
	house2024: 'https://api.electiondata.dev/v1/house-results/table/2024.csv',
	senate2024: 'https://api.electiondata.dev/v1/senate-results/table/2024.csv',
	president: 'https://dataverse.harvard.edu/api/access/datafile/13887042?format=original',
	presidentByDistrict:
		'https://docs.google.com/spreadsheets/d/1eZfaFI-c-PFOoKx1-zZA2MP0_dxRq_LVK0re3BOQqy0/export?format=csv&gid=1491069057',
	states: 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json',
	districts: (postal) => `https://watch.vote/api/elections/2026/districts/${postal.toLowerCase()}`
};

await mkdir(rawDir, { recursive: true });
await mkdir(districtDir, { recursive: true });

const houseSummary = parseCsv(await cachedText('house-districts.csv', SOURCES.houseDistricts));
const results = parseCsv(await cachedText('results.csv', SOURCES.results));
const house2024Rows = parseCsv(await cachedText('house-2024.csv', SOURCES.house2024));
const senate2024Rows = parseCsv(await cachedText('senate-2024.csv', SOURCES.senate2024));
const presidentRows = parseCsv(await cachedText('president.csv', SOURCES.president));

const statesTopo = JSON.parse(await cachedText('states-10m.json', SOURCES.states));
const statesFc = feature(statesTopo, statesTopo.objects.states);
const stateFeatures = [];
for (const item of statesFc.features) {
	const fips = String(item.id).padStart(2, '0');
	const postal = POSTAL_BY_FIPS.get(fips);
	if (!postal) continue;
	stateFeatures.push({
		type: 'Feature',
		properties: { postal, fips, name: NAME_BY_POSTAL.get(postal) },
		geometry: item.geometry
	});
}

let districtVintage = null;
const districtFeatures = new Map();
await mapPool(STATES, 3, async ([postal]) => {
	const { json, vintage } = await cachedJson(`districts-${postal}.json`, SOURCES.districts(postal));
	if (vintage && !districtVintage) districtVintage = vintage;
	const features = [];
	for (const item of json?.features ?? []) {
		const number = districtNumber(item.properties?.district ?? item.properties?.CD120);
		if (number == null) continue;
		features.push({
			type: 'Feature',
			properties: { postal, district: number, id: placeId(postal, number) },
			geometry: orientDistrict(shiftAlaska(postal, roundGeometry(item.geometry)))
		});
	}
	districtFeatures.set(postal, features);
});

const candidatesByRace = new Map();
let latestUpdate = '';
for (const row of results) {
	const office = row.office;
	if (office !== 'house' && office !== 'senate' && office !== 'governor') continue;
	const updated = row.results_updated_utc || '';
	if (updated > latestUpdate) latestUpdate = updated;
	const district = office === 'house' ? districtNumber(row.district) : 0;
	const key = `${office}:${row.state}:${district ?? ''}`;
	const list = candidatesByRace.get(key) ?? [];
	list.push({
		name: displayName(row.candidate),
		party: row.party || '',
		bucket: bucket(row.party),
		votes: num(row.votes) ?? 0,
		percent: num(row.percent),
		winner: yes(row.winner)
	});
	candidatesByRace.set(key, list);
	if (!candidatesByRace.has(`${office}:${row.state}:meta`)) {
		candidatesByRace.set(`${office}:${row.state}:meta`, {
			url: row.url,
			updatedUtc: updated,
			percentReporting: num(row.percent_reporting)
		});
	}
}

const house2024 = buildHouse2024(house2024Rows);
const senate2024 = buildSenate2024(senate2024Rows);
const president2024 = buildPresident2024(presidentRows);
const presidentByDistrict = buildPresidentByDistrict(
	await cachedText('president-by-district-2024.csv', SOURCES.presidentByDistrict)
);

const heldBefore = {
	governor: {
		AK: 'rep',
		AL: 'rep',
		AR: 'rep',
		AZ: 'dem',
		CA: 'dem',
		CO: 'dem',
		CT: 'dem',
		FL: 'rep',
		GA: 'rep',
		HI: 'dem',
		IA: 'rep',
		ID: 'rep',
		IL: 'dem',
		KS: 'dem',
		MA: 'dem',
		MD: 'dem',
		ME: 'dem',
		MI: 'dem',
		MN: 'dem',
		NE: 'rep',
		NH: 'rep',
		NM: 'dem',
		NV: 'rep',
		NY: 'dem',
		OH: 'rep',
		OK: 'rep',
		OR: 'dem',
		PA: 'dem',
		RI: 'dem',
		SC: 'rep',
		SD: 'rep',
		TN: 'rep',
		TX: 'rep',
		VT: 'rep',
		WI: 'dem',
		WY: 'rep'
	},
	senate: {
		AK: 'rep',
		AL: 'rep',
		AR: 'rep',
		CO: 'dem',
		DE: 'dem',
		FL: 'rep',
		GA: 'dem',
		IA: 'rep',
		ID: 'rep',
		IL: 'dem',
		KS: 'rep',
		KY: 'rep',
		LA: 'rep',
		MA: 'dem',
		ME: 'rep',
		MI: 'dem',
		MN: 'dem',
		MS: 'rep',
		MT: 'rep',
		NC: 'rep',
		NE: 'rep',
		NH: 'dem',
		NJ: 'dem',
		NM: 'dem',
		OH: 'rep',
		OK: 'rep',
		OR: 'dem',
		RI: 'dem',
		SC: 'rep',
		SD: 'rep',
		TN: 'rep',
		TX: 'rep',
		VA: 'dem',
		WV: 'rep',
		WY: 'rep'
	}
};

const districts = {};
const states = {};
const statuses = new Set();

for (const [postal, , name] of STATES) {
	const seats = { dem: 0, rep: 0, other: 0, uncalled: 0 };
	const votes = { dem: 0, rep: 0, other: 0, total: 0 };
	let linesChanged = false;

	for (const row of houseSummary) {
		if (row.state !== postal) continue;
		const number = districtNumber(row.district_number);
		if (number == null) continue;
		const id = placeId(postal, number);
		const summaryMargin = num(row.dem_margin_points);
		const priorMargin = num(row.house_2024_dem_margin);
		const changed = yes(row.house_2024_on_different_lines);
		if (changed) linesChanged = true;
		const status = (row.status || 'counting').toLowerCase();
		statuses.add(status);
		const called = status === 'called';
		const party = row.party || '';
		const group = bucket(party);
		const candidateKey = `house:${postal}:${number}`;
		const candidates = sortCandidates(candidatesByRace.get(candidateKey) ?? []);
		const meta = raceMeta(results, 'house', postal, number);
		const prior = house2024.get(id) ?? null;
		if (
			prior &&
			Math.abs(priorMargin ?? 0) === 100 &&
			prior.candidates.filter((c) => c.votes > 0).length < 2
		) {
			prior.uncontested = true;
		}
		if (
			prior &&
			Math.abs(priorMargin ?? 0) === 100 &&
			prior.uncontested !== false &&
			prior.candidates.length < 2
		) {
			prior.uncontested = true;
		}
		const demVotes = num(row.dem_votes) ?? 0;
		const repVotes = num(row.rep_votes) ?? 0;
		const otherVotes = num(row.other_votes) ?? 0;
		const totalVotes = num(row.total_votes) ?? demVotes + repVotes + otherVotes;
		const comparable =
			!changed && prior && !prior.uncontested && summaryMargin != null && prior.demMargin != null;
		const presidentDistrict = presidentByDistrict.get(id) ?? null;
		const record = {
			id,
			state: postal,
			district: number,
			name: numberLabel(name, number, postal),
			status,
			called,
			leader: displayName(row.winner_or_leader),
			party,
			bucket: group,
			demVotes,
			repVotes,
			otherVotes,
			totalVotes,
			demMargin: summaryMargin,
			percentReporting: num(row.percent_reporting),
			votesLeft: num(row.est_votes_left),
			incumbent: row.incumbent ? displayName(row.incumbent) : null,
			incumbentParty: row.incumbent_party || null,
			incumbentResult: row.incumbent_result || null,
			flip: yes(row.flip),
			linesChanged: changed,
			url: row.url || meta.url,
			updatedUtc: meta.updatedUtc || null,
			candidates,
			house2024: prior,
			pollingHouse2024Margin: priorMargin,
			presidentOnLines: num(row.president_2024_dem_margin_2026_lines),
			president2024: presidentDistrict,
			swing: comparable ? round1(summaryMargin - prior.demMargin) : null,
			swingVsPresident:
				summaryMargin != null && presidentDistrict?.demMargin != null
					? round1(summaryMargin - presidentDistrict.demMargin)
					: null
		};
		districts[id] = record;
		votes.dem += demVotes;
		votes.rep += repVotes;
		votes.other += otherVotes;
		votes.total += totalVotes;
		if (!called) seats.uncalled += 1;
		else if (group === 'dem') seats.dem += 1;
		else if (group === 'rep') seats.rep += 1;
		else seats.other += 1;
	}

	const president = president2024.get(postal) ?? null;
	states[postal] = {
		postal,
		name,
		fips: STATES.find((item) => item[0] === postal)[1],
		linesChanged,
		houseSeats: seats,
		houseVotes: {
			...votes,
			demMargin: votes.total > 0 ? round1(((votes.dem - votes.rep) / votes.total) * 100) : null
		},
		senate2026: statewideRace('senate', postal, president),
		governor2026: statewideRace('governor', postal, president),
		president2024: president,
		senate2024: senate2024.get(postal) ?? []
	};
}

const missingGeo = [];
const extraGeo = [];
for (const [postal] of STATES) {
	const features = districtFeatures.get(postal) ?? [];
	const seen = new Set();
	for (const item of features) {
		seen.add(item.properties.id);
		if (!districts[item.properties.id]) extraGeo.push(item.properties.id);
	}
	for (const id of Object.keys(districts)) {
		if (districts[id].state === postal && !seen.has(id)) missingGeo.push(id);
	}
	const collection = {
		type: 'FeatureCollection',
		features: features.filter((item) => districts[item.properties.id])
	};
	await writeFile(path.join(districtDir, `${postal}.json`), JSON.stringify(collection));
}

if (missingGeo.length > 8) {
	throw new Error(
		`District geometry missing for ${missingGeo.length} races: ${missingGeo.slice(0, 12).join(', ')}`
	);
}

const election = {
	sources: {
		generatedAt: new Date().toISOString(),
		resultsUpdatedUtc: latestUpdate ? `${latestUpdate.replace(' ', 'T')}Z` : null,
		unofficial: true,
		districtVintage,
		districtSource: 'U.S. Census Bureau TIGERweb 120th Congressional Districts, via watch.vote',
		stateSource: 'U.S. Census Bureau cartographic state boundaries, 1:10,000,000, via us-atlas',
		resultsSource:
			'Polling Desk (polling-desk.com), using civicAPI. Unofficial until each state certifies.',
		historySource:
			'MIT Election Data and Science Lab, U.S. House 1976–2024, U.S. Senate statewide 1976–2024, and U.S. President statewide 1976–2024 (CC0), via electiondata.dev and Harvard Dataverse. Presidential vote by the congressional districts used in 2026: The Downballot.'
	},
	senate: controlSeats('senate-control', 100),
	states,
	districts
};

await writeFile(
	path.join(outDir, 'states.json'),
	JSON.stringify({ type: 'FeatureCollection', features: stateFeatures })
);
await writeFile(path.join(outDir, 'election.json'), JSON.stringify(election));

const districtCount = Object.keys(districts).length;
const called = Object.values(districts).filter((d) => d.called).length;
const flips = Object.values(districts).filter((d) => d.flip).length;
console.log(
	`Districts ${districtCount}, called ${called}, counting ${districtCount - called}, flips ${flips}`
);
console.log(`Statuses: ${[...statuses].join(', ')}`);
console.log(`Geometry missing (${missingGeo.length}): ${missingGeo.join(', ') || 'none'}`);
console.log(
	`Geometry without a race (${extraGeo.length}): ${extraGeo.slice(0, 12).join(', ') || 'none'}`
);
console.log(
	`AZ-1`,
	JSON.stringify({
		leader: districts['AZ-1']?.leader,
		margin: districts['AZ-1']?.demMargin,
		prior: districts['AZ-1']?.house2024?.demMargin,
		lines: districts['AZ-1']?.linesChanged,
		swing: districts['AZ-1']?.swing,
		flip: districts['AZ-1']?.flip
	})
);
console.log(
	`AL-1 lines changed`,
	districts['AL-1']?.linesChanged,
	'prior',
	districts['AL-1']?.house2024?.demMargin
);
console.log(
	`GA-2 president`,
	districts['GA-2']?.president2024?.demVotes,
	districts['GA-2']?.president2024?.repVotes,
	districts['GA-2']?.president2024?.demMargin
);
const uncalled = Object.values(districts).find((d) => !d.called);
console.log(`Uncalled example`, uncalled?.id, uncalled?.status, uncalled?.leader);
console.log(`Senate`, election.senate);
console.log(`Senate flips`, flipTotals('senate'));
console.log(`Governor flips`, flipTotals('governor'));
console.log(`Results updated`, latestUpdate);
console.log(`District vintage`, districtVintage);

function flipTotals(office) {
	const counts = { dem: 0, rep: 0 };
	for (const state of Object.values(states)) {
		const race = office === 'senate' ? state.senate2026 : state.governor2026;
		if (!race?.flip) continue;
		if (race.bucket === 'dem' || race.bucket === 'rep') counts[race.bucket] += 1;
	}
	return counts;
}

function controlSeats(office, size) {
	const seats = { dem: 0, rep: 0, other: 0, uncalled: 0 };
	for (const row of results) {
		if (row.office !== office) continue;
		const count = num(row.seats) ?? 0;
		const group = bucket(row.party);
		if (group === 'dem') seats.dem += count;
		else if (group === 'rep') seats.rep += count;
		else seats.other += count;
	}
	const counted = seats.dem + seats.rep + seats.other;
	if (counted < size) seats.uncalled = size - counted;
	return seats;
}

function statewideRace(office, postal, president) {
	const rows = results.filter((row) => row.office === office && row.state === postal);
	if (!rows.length) return null;
	const candidates = sortCandidates(
		rows.map((row) => ({
			name: displayName(row.candidate),
			party: row.party || '',
			bucket: bucket(row.party),
			votes: num(row.votes) ?? 0,
			percent: num(row.percent),
			winner: yes(row.winner)
		}))
	);
	const calledRow = rows.find((row) => yes(row.winner));
	const tally = tallyCandidates(candidates);
	const demMargin = tally.total > 0 ? round1(((tally.dem - tally.rep) / tally.total) * 100) : null;
	const called = Boolean(calledRow);
	const leader = calledRow ? displayName(calledRow.candidate) : (candidates[0]?.name ?? null);
	const party = calledRow?.party || candidates[0]?.party || '';
	const swingVsPresident =
		called && demMargin != null && president?.demMargin != null
			? round1(demMargin - president.demMargin)
			: null;
	const winnerBucket = bucket(party);
	const priorBucket = heldBefore[office]?.[postal] ?? null;
	return {
		office,
		status: called ? 'called' : 'counting',
		called,
		leader,
		party,
		bucket: winnerBucket,
		flip: Boolean(called && priorBucket && winnerBucket !== priorBucket),
		...tally,
		demMargin,
		percentReporting: num(rows[0].percent_reporting),
		updatedUtc: rows[0].results_updated_utc
			? `${rows[0].results_updated_utc.replace(' ', 'T')}Z`
			: null,
		url: rows[0].url,
		candidates,
		swingVsPresident
	};
}

function raceMeta(rows, office, postal, district) {
	const row = rows.find(
		(item) =>
			item.office === office && item.state === postal && districtNumber(item.district) === district
	);
	return {
		url: row?.url ?? null,
		updatedUtc: row?.results_updated_utc ? `${row.results_updated_utc.replace(' ', 'T')}Z` : null
	};
}

function buildHouse2024(rows) {
	const grouped = new Map();
	for (const row of rows) {
		if (String(row.year) !== '2024') continue;
		if (yes(row.special)) continue;
		if ((row.stage || 'GEN') !== 'GEN' && row.stage !== 'RUNOFF') continue;
		if (yes(row.fusion_ticket)) continue;
		const number = districtNumber(row.district);
		if (number == null) continue;
		const id = placeId(row.state_po, number);
		const list = grouped.get(id) ?? [];
		list.push(row);
		grouped.set(id, list);
	}
	const out = new Map();
	for (const [id, list] of grouped) {
		const runoff = list.filter((row) => yes(row.runoff) || row.stage === 'RUNOFF');
		const chosen = runoff.length
			? runoff
			: list.filter((row) => !yes(row.runoff) && row.stage !== 'RUNOFF');
		out.set(id, summarizeHistorical(chosen));
	}
	return out;
}

function buildSenate2024(rows) {
	const grouped = new Map();
	for (const row of rows) {
		if (String(row.year) !== '2024') continue;
		const stage = row.stage || 'GEN';
		if (stage !== 'GEN' && stage !== 'RUNOFF') continue;
		const key = `${row.state_po}:${yes(row.special) ? 'special' : 'regular'}`;
		const list = grouped.get(key) ?? [];
		list.push(row);
		grouped.set(key, list);
	}
	const out = new Map();
	for (const [key, list] of grouped) {
		const [postal, kind] = key.split(':');
		const runoff = list.filter((row) => row.stage === 'RUNOFF');
		const chosen = runoff.length ? runoff : list.filter((row) => row.stage === 'GEN');
		const summary = summarizeHistorical(chosen);
		summary.special = kind === 'special';
		const races = out.get(postal) ?? [];
		races.push(summary);
		out.set(postal, races);
	}
	return out;
}

function buildPresidentByDistrict(text) {
	const rows = splitCsv(text);
	const sub = rows.find(
		(cells) => cells.includes('Harris') && cells.includes('Trump') && cells.includes('Total')
	);
	if (!sub)
		throw new Error('Presidential district sheet is missing Harris, Trump, and Total columns');
	const demCol = sub.indexOf('Harris');
	const repCol = sub.indexOf('Trump');
	const totalCol = sub.indexOf('Total');
	const out = new Map();
	for (const cells of rows) {
		const match = /^([A-Z]{2})-(AL|\d+)$/.exec(cells[0] || '');
		if (!match) continue;
		const demVotes = intWithCommas(cells[demCol]);
		const repVotes = intWithCommas(cells[repCol]);
		const totalVotes = intWithCommas(cells[totalCol]);
		if (demVotes == null || repVotes == null || totalVotes == null || totalVotes <= 0) continue;
		const otherVotes = Math.max(0, totalVotes - demVotes - repVotes);
		const candidates = sortCandidates([
			{
				name: 'Kamala Harris',
				party: 'DEM',
				bucket: 'dem',
				votes: demVotes,
				percent: round1((demVotes / totalVotes) * 100),
				winner: demVotes > repVotes
			},
			{
				name: 'Donald Trump',
				party: 'REP',
				bucket: 'rep',
				votes: repVotes,
				percent: round1((repVotes / totalVotes) * 100),
				winner: repVotes > demVotes
			},
			...(otherVotes
				? [
						{
							name: 'Other',
							party: 'OTH',
							bucket: 'other',
							votes: otherVotes,
							percent: round1((otherVotes / totalVotes) * 100),
							winner: false
						}
					]
				: [])
		]);
		out.set(placeId(match[1], match[2] === 'AL' ? 1 : Number(match[2])), {
			demVotes,
			repVotes,
			otherVotes,
			totalVotes,
			demMargin: round1(((demVotes - repVotes) / totalVotes) * 100),
			winner: demVotes === repVotes ? null : demVotes > repVotes ? 'Kamala Harris' : 'Donald Trump',
			lines: '2026',
			candidates
		});
	}
	if (out.size < 400) throw new Error(`Presidential district sheet matched ${out.size} districts`);
	return out;
}

function intWithCommas(value) {
	if (value == null || value === '') return null;
	const number = Number(String(value).replace(/,/g, ''));
	return Number.isFinite(number) ? number : null;
}

function buildPresident2024(rows) {
	const grouped = new Map();
	for (const row of rows) {
		if (String(row.year) !== '2024') continue;
		const list = grouped.get(row.state_po) ?? [];
		list.push(row);
		grouped.set(row.state_po, list);
	}
	const out = new Map();
	for (const [postal, list] of grouped) out.set(postal, summarizeHistorical(list));
	return out;
}

function summarizeHistorical(rows) {
	const byName = new Map();
	let totalHint = 0;
	for (const row of rows) {
		if (yes(row.writein) && !row.candidate) continue;
		const name = displayName(row.candidate || 'Write-in');
		if (!name || name.toUpperCase() === 'WRITEIN') continue;
		const votes = num(row.candidate_total_votes) ?? num(row.candidatevotes) ?? 0;
		const party = row.party_detailed || row.party || row.party_simplified || '';
		const existing = byName.get(name);
		if (existing) existing.votes = Math.max(existing.votes, votes);
		else {
			byName.set(name, {
				name,
				party,
				bucket: bucket(row.party_simplified || party),
				votes,
				percent: null,
				winner: false
			});
		}
		totalHint = Math.max(totalHint, num(row.totalvotes) ?? 0);
	}
	const candidates = sortCandidates([...byName.values()]);
	const tally = tallyCandidates(candidates);
	const total =
		totalHint >= tally.dem + tally.rep + tally.other
			? totalHint
			: tally.dem + tally.rep + tally.other;
	const other = tally.other + Math.max(0, total - (tally.dem + tally.rep + tally.other));
	const demMargin = total > 0 ? round1(((tally.dem - tally.rep) / total) * 100) : null;
	for (const candidate of candidates) {
		candidate.percent = total > 0 ? round1((candidate.votes / total) * 100) : null;
	}
	const leader = candidates[0] ?? null;
	if (leader)
		leader.winner =
			candidates.filter((c) => c.votes > 0).length >= 1 &&
			(candidates[1]?.votes ?? 0) !== leader.votes;
	const named = candidates.filter((c) => c.votes > 0);
	return {
		uncontested: named.length < 2,
		demVotes: tally.dem,
		repVotes: tally.rep,
		otherVotes: other,
		totalVotes: total,
		demMargin: named.length < 2 ? null : demMargin,
		winner: leader?.name ?? null,
		party: leader?.party ?? null,
		bucket: leader?.bucket ?? 'other',
		candidates: candidates.slice(0, 6)
	};
}

function tallyCandidates(candidates) {
	let dem = 0;
	let rep = 0;
	let other = 0;
	for (const candidate of candidates) {
		if (candidate.bucket === 'dem') dem += candidate.votes;
		else if (candidate.bucket === 'rep') rep += candidate.votes;
		else other += candidate.votes;
	}
	return {
		demVotes: dem,
		repVotes: rep,
		otherVotes: other,
		totalVotes: dem + rep + other,
		dem,
		rep,
		other,
		total: dem + rep + other
	};
}

function sortCandidates(candidates) {
	return [...candidates].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

function bucket(party) {
	const value = String(party || '').toUpperCase();
	if (value === 'DEM' || value === 'D' || value === 'DFL' || value.startsWith('DEM')) return 'dem';
	if (value === 'REP' || value === 'R' || value === 'GOP' || value.startsWith('REP')) return 'rep';
	return 'other';
}

function districtNumber(value) {
	if (value == null || value === '') return null;
	const text = String(value).trim().toUpperCase();
	if (text === 'AL' || text === '00' || text === '0' || text === 'AT-LARGE' || text === 'AT LARGE')
		return 1;
	if (text === 'ZZ' || text === 'STATEWIDE') return null;
	const number = Number(text);
	if (!Number.isInteger(number) || number < 0) return null;
	return number === 0 ? 1 : number;
}

function placeId(postal, number) {
	return `${postal}-${number}`;
}

function numberLabel(stateName, number, postal) {
	const atLarge = ['AK', 'DE', 'ND', 'SD', 'VT', 'WY'].includes(postal);
	return atLarge ? `${stateName} at large` : `${stateName} ${number}`;
}

function displayName(raw) {
	if (!raw) return '';
	let text = String(raw).trim().replace(/^"|"$/g, '');
	if (!text) return '';
	if (text.includes(',')) {
		const [last, rest] = text.split(/,(.+)/);
		if (rest) text = `${rest.trim()} ${last.trim()}`;
	}
	text = text.replace(/\\+"/g, '"');
	if (text === text.toUpperCase()) {
		text = text.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
		text = text.replace(/\b(Ii|Iii|Iv)\b/g, (part) => part.toUpperCase());
	}
	return text.replace(/\s+/g, ' ').trim();
}

function num(value) {
	if (value == null || value === '') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function yes(value) {
	const text = String(value ?? '').toLowerCase();
	return text === 'true' || text === 'yes' || text === '1';
}

function round1(value) {
	return Math.round(value * 10) / 10;
}

function orientDistrict(geometry) {
	if (!geometry) return geometry;
	const area = geoArea({ type: 'Feature', properties: {}, geometry });
	if (area <= Math.PI) return geometry;
	const reverseRing = (ring) => ring.slice().reverse();
	if (geometry.type === 'Polygon') {
		return { type: 'Polygon', coordinates: geometry.coordinates.map(reverseRing) };
	}
	if (geometry.type === 'MultiPolygon') {
		return {
			type: 'MultiPolygon',
			coordinates: geometry.coordinates.map((polygon) => polygon.map(reverseRing))
		};
	}
	return geometry;
}

function shiftAlaska(postal, geometry) {
	if (postal !== 'AK' || !geometry) return geometry;
	const shift = (pair) => [
		pair[0] > 0 ? Math.round((pair[0] - 360) * 1000) / 1000 : pair[0],
		pair[1]
	];
	const walk = (coordinates) =>
		typeof coordinates[0] === 'number' ? shift(coordinates) : coordinates.map(walk);
	return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

function roundGeometry(geometry) {
	if (!geometry) return geometry;
	const round = (pair) => [Math.round(pair[0] * 1000) / 1000, Math.round(pair[1] * 1000) / 1000];
	const walk = (coordinates) => {
		if (typeof coordinates[0] === 'number') return round(coordinates);
		return coordinates.map(walk);
	};
	return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

function parseCsv(text) {
	const rows = splitCsv(text);
	const [header, ...body] = rows;
	return body.map((cells) => {
		const record = {};
		header.forEach((key, index) => {
			record[key] = cells[index] ?? '';
		});
		return record;
	});
}

function splitCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n') {
			row.push(field);
			field = '';
			if (row.some((cell) => cell !== '')) rows.push(row);
			row = [];
		} else if (char !== '\r') field += char;
	}
	if (field.length || row.length) {
		row.push(field);
		if (row.some((cell) => cell !== '')) rows.push(row);
	}
	return rows;
}

async function cachedText(name, url) {
	const file = path.join(rawDir, name);
	if (!fresh) {
		try {
			return await readFile(file, 'utf8');
		} catch {
			// Download when the cache is empty.
		}
	}
	const text = await getText(url);
	await writeFile(file, text);
	return text;
}

async function cachedJson(name, url) {
	const file = path.join(rawDir, name);
	const vintageFile = path.join(rawDir, `${name}.vintage`);
	if (!fresh) {
		try {
			const json = JSON.parse(await readFile(file, 'utf8'));
			let vintage = null;
			try {
				vintage = (await readFile(vintageFile, 'utf8')).trim();
			} catch {
				vintage = null;
			}
			return { json, vintage };
		} catch {
			// Download when the cache is empty.
		}
	}
	const { json, vintage } = await getJson(url);
	if (json) await writeFile(file, JSON.stringify(json));
	if (vintage) await writeFile(vintageFile, vintage);
	return { json, vintage };
}

async function getText(url, attempt = 0) {
	const response = await fetch(url, {
		headers: {
			'user-agent': '2026-midterms-data-build',
			accept: 'text/csv,application/json,application/geo+json,*/*'
		},
		redirect: 'follow'
	});
	if (response.status === 429 && attempt < 4) {
		const wait = Number(response.headers.get('retry-after') || 2) * 1000;
		await delay(wait);
		return getText(url, attempt + 1);
	}
	if (!response.ok) throw new Error(`${response.status} ${url}`);
	return response.text();
}

async function getJson(url, attempt = 0) {
	const response = await fetch(url, {
		headers: {
			'user-agent': '2026-midterms-data-build',
			accept: 'application/geo+json,application/json'
		},
		redirect: 'follow'
	});
	if (response.status === 404) return { json: null, vintage: null };
	if (response.status === 429 && attempt < 4) {
		const wait = Number(response.headers.get('retry-after') || 2) * 1000;
		await delay(wait);
		return getJson(url, attempt + 1);
	}
	if (!response.ok) throw new Error(`${response.status} ${url}`);
	const vintage = response.headers.get('x-data-vintage');
	return { json: await response.json(), vintage };
}

async function mapPool(items, size, task) {
	let index = 0;
	async function worker() {
		while (index < items.length) {
			const current = index;
			index += 1;
			await task(items[current], current);
		}
	}
	await Promise.all(Array.from({ length: size }, () => worker()));
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
