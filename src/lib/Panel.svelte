<script lang="ts">
	import {
		formatMargin,
		formatShift,
		formatVotes,
		formatWhen,
		partyLabel,
		statusLabel
	} from './format.js';
	import type { District, ElectionData, Office, Selection, StateRecord } from './types.js';

	let {
		selection,
		office = 'house',
		election,
		onClose,
		onDeselect,
		onSelectDistrict
	}: {
		selection: Selection | null;
		office?: Office;
		election: ElectionData;
		onClose: () => void;
		onDeselect: () => void;
		onSelectDistrict: (id: string) => void;
	} = $props();

	const place = $derived(selection?.type === 'district' ? selection.place : null);
	const state = $derived<StateRecord | null>(
		selection?.type === 'district' ? selection.state : (selection?.place ?? null)
	);
	const race = $derived(
		selection?.type === 'district'
			? selection.place
			: selection?.type === 'state'
				? selection.race
				: null
	);
	const officeName = $derived(
		selection?.type === 'district' || selection?.type === 'house-state'
			? 'House'
			: selection?.office === 'senate'
				? 'Senate'
				: 'Governor'
	);
	const priorHouse = $derived(
		selection?.type === 'house-state' ? tallyPriorHouse(selection.districts) : null
	);
	const nation = $derived(summarizeNation(election, office));
	const nationLabel = $derived(
		office === 'senate' ? 'Senate' : office === 'governor' ? 'Governor' : 'House'
	);
	const projectedFlip = $derived.by(() => {
		if (!place || place.called) return null;
		const prior = place.house2024?.bucket;
		if (!prior || place.demMargin == null || Math.abs(place.demMargin) < 0.05) return null;
		const ahead = place.demMargin > 0 ? 'dem' : 'rep';
		return ahead !== prior;
	});

	interface PriorHouse {
		dem: number;
		rep: number;
		other: number;
		missing: number;
		uncontested: number;
		flips: number;
		demVotes: number;
		repVotes: number;
		otherVotes: number;
		totalVotes: number;
		demMargin: number | null;
	}

	function tallyPriorHouse(districts: District[]): PriorHouse {
		const seats: PriorHouse = {
			dem: 0,
			rep: 0,
			other: 0,
			missing: 0,
			uncontested: 0,
			flips: 0,
			demVotes: 0,
			repVotes: 0,
			otherVotes: 0,
			totalVotes: 0,
			demMargin: null
		};
		for (const district of districts) {
			if (district.flip) seats.flips += 1;
			const prior = district.house2024;
			if (!prior) {
				seats.missing += 1;
				continue;
			}
			if (prior.uncontested) seats.uncontested += 1;
			if (prior.bucket === 'dem') seats.dem += 1;
			else if (prior.bucket === 'rep') seats.rep += 1;
			else seats.other += 1;
			seats.demVotes += prior.demVotes ?? 0;
			seats.repVotes += prior.repVotes ?? 0;
			seats.otherVotes += prior.otherVotes ?? 0;
			seats.totalVotes += prior.totalVotes ?? 0;
		}
		seats.demMargin =
			seats.totalVotes > 0
				? Math.round(((seats.demVotes - seats.repVotes) / seats.totalVotes) * 1000) / 10
				: null;
		return seats;
	}

	function comparedWith(value: number | null | undefined, baseline: string) {
		const shift = formatShift(value);
		if (!shift) return null;
		if (shift.startsWith('Essentially')) return `Essentially unchanged from ${baseline}`;
		return shift.replace('than 2024', `than ${baseline}`);
	}

	function seatLine(
		seats: { dem: number; rep: number; other: number; uncalled?: number; noRace?: number },
		includeNoRace: boolean
	) {
		const parts = [`${seats.dem} Democratic`, `${seats.rep} Republican`];
		if (seats.other) parts.push(`${seats.other} other`);
		if (seats.uncalled) parts.push(`${seats.uncalled} not called`);
		if (includeNoRace && seats.noRace) parts.push(`${seats.noRace} no race`);
		return parts.join(' · ');
	}

	function tallyFlips(races: { flip: boolean; called: boolean; bucket: string }[]) {
		const counts = { dem: 0, rep: 0 };
		for (const race of races) {
			if (!race.flip || !race.called) continue;
			if (race.bucket === 'dem') counts.dem += 1;
			else if (race.bucket === 'rep') counts.rep += 1;
		}
		return counts;
	}

	function officeFlips(which: Office) {
		if (which === 'house') return tallyFlips(Object.values(election.districts));
		const races = [];
		for (const item of Object.values(election.states)) {
			const race = which === 'senate' ? item.senate2026 : item.governor2026;
			if (race) races.push(race);
		}
		return tallyFlips(races);
	}

	function share(part: number, total: number) {
		if (!total) return '0%';
		return `${Math.round((part / total) * 1000) / 10}%`;
	}

	function round1(value: number) {
		return Math.round(value * 10) / 10;
	}

	interface VoteTally {
		dem: number;
		rep: number;
		other: number;
		total: number;
		demMargin: number | null;
	}

	interface PresidentSummary {
		demMargin: number | null;
		winner: string | null;
		candidates: {
			name: string;
			party: string;
			bucket: string;
			votes: number;
			percent: number | null;
		}[];
	}

	type NationSummary =
		| {
				office: 'house';
				linesChanged: number;
				seats: { dem: number; rep: number; other: number; uncalled: number };
				votes: VoteTally;
				prior: PriorHouse;
				priorVotes: { dem: number; rep: number; other: number; total: number };
				president: PresidentSummary;
				swing: number | null;
		  }
		| {
				office: 'senate' | 'governor';
				linesChanged: number;
				seats: {
					dem: number;
					rep: number;
					other: number;
					uncalled: number;
					races: number;
					noRace: number;
				};
				votes: VoteTally;
				president: PresidentSummary;
				priorSenate: { dem: number; rep: number; other: number; races: number } | null;
		  };

	function summarizeNation(data: ElectionData, whichOffice: Office): NationSummary {
		const states = Object.values(data.states);
		const linesChanged = states.filter((item) => item.linesChanged).length;
		const president = sumPresident(states);

		if (whichOffice === 'house') {
			const seats = { dem: 0, rep: 0, other: 0, uncalled: 0 };
			const votes = { dem: 0, rep: 0, other: 0, total: 0, demMargin: null as number | null };
			for (const item of states) {
				seats.dem += item.houseSeats?.dem ?? 0;
				seats.rep += item.houseSeats?.rep ?? 0;
				seats.other += item.houseSeats?.other ?? 0;
				seats.uncalled += item.houseSeats?.uncalled ?? 0;
				votes.dem += item.houseVotes?.dem ?? 0;
				votes.rep += item.houseVotes?.rep ?? 0;
				votes.other += item.houseVotes?.other ?? 0;
				votes.total += item.houseVotes?.total ?? 0;
			}
			votes.demMargin =
				votes.total > 0 ? round1(((votes.dem - votes.rep) / votes.total) * 100) : null;
			const prior = tallyPriorHouse(Object.values(data.districts));
			const swing =
				votes.demMargin != null && president.demMargin != null
					? round1(votes.demMargin - president.demMargin)
					: null;
			return {
				office: 'house',
				linesChanged,
				seats,
				votes,
				prior,
				priorVotes: {
					dem: prior.demVotes,
					rep: prior.repVotes,
					other: prior.otherVotes,
					total: prior.totalVotes
				},
				president,
				swing
			};
		}

		const seats = {
			dem: 0,
			rep: 0,
			other: 0,
			uncalled: 0,
			races: 0,
			noRace: 0
		};
		const votes = { dem: 0, rep: 0, other: 0, total: 0, demMargin: null as number | null };
		for (const item of states) {
			const race = whichOffice === 'senate' ? item.senate2026 : item.governor2026;
			if (!race) {
				seats.noRace += 1;
				continue;
			}
			seats.races += 1;
			if (!race.called) seats.uncalled += 1;
			else if (race.bucket === 'dem') seats.dem += 1;
			else if (race.bucket === 'rep') seats.rep += 1;
			else seats.other += 1;
			votes.dem += race.demVotes ?? 0;
			votes.rep += race.repVotes ?? 0;
			votes.other += race.otherVotes ?? 0;
			votes.total += race.totalVotes ?? 0;
		}
		votes.demMargin =
			votes.total > 0 ? round1(((votes.dem - votes.rep) / votes.total) * 100) : null;

		let priorSenate: { dem: number; rep: number; other: number; races: number } | null = null;
		if (whichOffice === 'senate') {
			priorSenate = { dem: 0, rep: 0, other: 0, races: 0 };
			for (const item of states) {
				for (const race of item.senate2024 ?? []) {
					priorSenate.races += 1;
					if (race.bucket === 'dem') priorSenate.dem += 1;
					else if (race.bucket === 'rep') priorSenate.rep += 1;
					else priorSenate.other += 1;
				}
			}
		}

		return {
			office: whichOffice,
			linesChanged,
			seats,
			votes,
			president,
			priorSenate
		};
	}

	function sumPresident(states: StateRecord[]) {
		const byName: Record<
			string,
			{ name: string; party: string; bucket: string; votes: number; percent: number | null }
		> = {};
		let dem = 0;
		let rep = 0;
		let total = 0;
		for (const item of states) {
			const race = item.president2024;
			if (!race) continue;
			dem += race.demVotes ?? 0;
			rep += race.repVotes ?? 0;
			total += race.totalVotes ?? 0;
			for (const candidate of race.candidates ?? []) {
				const existing = byName[candidate.name] ?? {
					name: candidate.name,
					party: candidate.party,
					bucket: candidate.bucket,
					votes: 0,
					percent: null
				};
				existing.votes += candidate.votes ?? 0;
				byName[candidate.name] = existing;
			}
		}
		const candidates = Object.values(byName)
			.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
			.slice(0, 4);
		for (const candidate of candidates) {
			candidate.percent = total > 0 ? round1((candidate.votes / total) * 100) : null;
		}
		return {
			demMargin: total > 0 ? round1(((dem - rep) / total) * 100) : null,
			winner: candidates[0]?.name ?? null,
			candidates
		};
	}
</script>

<aside aria-label="Election details">
	{#snippet flipTally(counts: { dem: number; rep: number })}
		<span
			class="flip-counts"
			aria-label="{counts.dem} flipped to Democrats, {counts.rep} flipped to Republicans"
		>
			<span class="dem" aria-hidden="true">{counts.dem}</span>
			<span class="rep" aria-hidden="true">{counts.rep}</span>
			<span class="name" aria-hidden="true">flips</span>
		</span>
	{/snippet}

	{#snippet voteBars(tally: { dem: number; rep: number; other: number; total: number })}
		<ul>
			<li>
				<div class="who">
					<span>Democratic</span>
					<span class="dem">{formatVotes(tally.dem)}</span>
				</div>
				<div class="bar" aria-hidden="true">
					<span class="dem" style:width={share(tally.dem, tally.total)}></span>
				</div>
			</li>
			<li>
				<div class="who">
					<span>Republican</span>
					<span class="rep">{formatVotes(tally.rep)}</span>
				</div>
				<div class="bar" aria-hidden="true">
					<span class="rep" style:width={share(tally.rep, tally.total)}></span>
				</div>
			</li>
			{#if tally.other}
				<li>
					<div class="who">
						<span>Other</span>
						<span class="other">{formatVotes(tally.other)}</span>
					</div>
					<div class="bar" aria-hidden="true">
						<span class="other" style:width={share(tally.other, tally.total)}></span>
					</div>
				</li>
			{/if}
		</ul>
	{/snippet}

	{#if !selection}
		{#key office}
			<span {@attach (node) => node.closest('aside')?.scrollTo(0, 0)}></span>
		{/key}
		<header>
			<p class="kicker">{nationLabel} · Nationwide</p>
			<h2>United States</h2>
			<p class="leader">
				{nation.office === 'senate'
					? seatLine(election.senate, false)
					: seatLine(nation.seats, nation.office !== 'house')}
			</p>
			<p class="margin">
				<span>{formatMargin(nation.votes.demMargin)}</span>
				{@render flipTally(officeFlips(office))}
			</p>
			<p class="meta">
				{#if nation.office === 'house'}
					Democratic margin of House votes counted nationwide.
				{:else if nation.office === 'senate'}
					All 100 seats, including those not on the ballot in 2026. Democratic margin of votes in
					the {nation.seats.races} states with a 2026 Senate race.
				{:else}
					Democratic margin of votes in the {nation.seats.races} states with a 2026
					{nationLabel} race.
				{/if}
			</p>
		</header>
		<section>
			<h3>2026</h3>
			{@render voteBars(nation.votes)}
			{#if nation.office === 'senate'}
				<p class="note">{seatLine(nation.seats, false)} elected this year.</p>
			{/if}
			{#if nation.office === 'house' && nation.prior.flips}
				<p class="note">
					{nation.prior.flips}
					{nation.prior.flips === 1 ? 'district' : 'districts'} changed party from the 2024 district with
					the same number.
				</p>
			{/if}
			{#if nation.office === 'house' && nation.swing != null}
				<p class="shift">
					{comparedWith(nation.swing, 'the 2024 presidential popular vote')}.
				</p>
			{/if}
			{#if nation.office === 'house' && nation.linesChanged}
				<p class="warn">
					{nation.linesChanged}
					{nation.linesChanged === 1 ? 'state redrew' : 'states redrew'} district lines after 2024, so
					a seat change is not a swing in those states.
				</p>
			{/if}
		</section>
		<section>
			<h3>2024</h3>
			{#if nation.office === 'house'}
				<p>
					House, nationwide: {formatMargin(nation.prior.demMargin)}
					· {nation.prior.dem} Democratic seats · {nation.prior.rep} Republican seats
					{#if nation.prior.other}· {nation.prior.other} other{/if}
					{#if nation.prior.uncontested}· {nation.prior.uncontested} uncontested{/if}
				</p>
				{@render voteBars(nation.priorVotes)}
				{#if nation.linesChanged}
					<p class="note">
						Seat counts use the 2024 district number. The vote total is every House vote.
					</p>
				{/if}
			{:else if nation.priorSenate}
				<p>
					Senate, states that voted in 2024: {nation.priorSenate.dem} Democratic · {nation
						.priorSenate.rep} Republican
					{#if nation.priorSenate.other}· {nation.priorSenate.other} other{/if}
					· {nation.priorSenate.races} races
				</p>
			{/if}
			<p>
				President, popular vote: {formatMargin(nation.president.demMargin)}
				{#if nation.president.winner}· {nation.president.winner}{/if}
			</p>
			<ul>
				{#each nation.president.candidates as candidate (candidate.name)}
					<li>
						<div class="who">
							<span>{candidate.name}</span>
							<span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
						</div>
						<div class="nums">
							{formatVotes(candidate.votes)} · {candidate.percent}%
						</div>
					</li>
				{/each}
			</ul>
		</section>
		<p class="fine">
			Unofficial.
			{#if election.sources?.resultsUpdatedUtc}Updated {formatWhen(
					election.sources.resultsUpdatedUtc
				)}.{/if}
		</p>
	{:else if state}
		{#key place ? place.id : `${selection.type}:${state.postal}`}
			<span {@attach (node) => node.closest('aside')?.scrollTo(0, 0)}></span>
		{/key}
		<header>
			<div class="actions">
				{#if selection.type === 'district'}
					<button type="button" onclick={onDeselect}>Deselect district</button>
				{/if}
				<button type="button" onclick={onClose}>All states</button>
			</div>
			<p class="kicker">
				{officeName} · {selection.type === 'house-state'
					? 'Statewide'
					: race
						? statusLabel(race.status)
						: 'No 2026 race'}
			</p>
			<h2>{place ? place.name : state.name}</h2>
			{#if race}
				<p class="leader">
					{race.called ? 'Winner' : 'Leader'}: {race.leader}
					<span class={race.bucket}>{partyLabel(race.party)}</span>
				</p>
				<p class="margin">
					<span>
						{race.called ? formatMargin(race.demMargin) : `${formatMargin(race.demMargin)} so far`}
					</span>
					{#if selection.type === 'state'}
						{@render flipTally(tallyFlips([race]))}
					{/if}
				</p>
				{#if place && !place.called && projectedFlip}
					<p class="flag">Would be a party flip with these results</p>
				{:else if place && place.flip}
					<p class="flag">Party flip from the 2024 district with this number</p>
				{/if}
				<p class="meta">
					{race.percentReporting == null
						? 'Reporting percent unavailable'
						: `${race.percentReporting}% reporting`}
					{#if place && place.votesLeft && !place.called}
						· about {formatVotes(place.votesLeft)} votes left
					{/if}
				</p>
			{:else if selection.type === 'house-state'}
				<p class="leader">
					{state.houseSeats.dem} Democratic · {state.houseSeats.rep} Republican
					{#if state.houseSeats.other}· {state.houseSeats.other} other{/if}
					{#if state.houseSeats.uncalled}· {state.houseSeats.uncalled} not called{/if}
				</p>
				<p class="margin">
					<span>{formatMargin(state.houseVotes.demMargin)}</span>
					{#if selection.type === 'house-state'}
						{@render flipTally(tallyFlips(selection.districts))}
					{/if}
				</p>
				<p class="meta">
					Democratic margin of House votes counted in {state.name}.
				</p>
			{:else}
				<p class="leader">
					No {officeName.toLowerCase()} election in {state.name} in 2026.
				</p>
			{/if}
		</header>

		{#if selection.type === 'house-state' && priorHouse}
			<section>
				<h3>2026 House votes</h3>
				<ul>
					<li>
						<div class="who">
							<span>Democratic</span>
							<span class="dem">{formatVotes(state.houseVotes.dem)}</span>
						</div>
						<div class="bar" aria-hidden="true">
							<span class="dem" style:width={share(state.houseVotes.dem, state.houseVotes.total)}
							></span>
						</div>
					</li>
					<li>
						<div class="who">
							<span>Republican</span>
							<span class="rep">{formatVotes(state.houseVotes.rep)}</span>
						</div>
						<div class="bar" aria-hidden="true">
							<span class="rep" style:width={share(state.houseVotes.rep, state.houseVotes.total)}
							></span>
						</div>
					</li>
					{#if state.houseVotes.other}
						<li>
							<div class="who">
								<span>Other</span>
								<span class="other">{formatVotes(state.houseVotes.other)}</span>
							</div>
							<div class="bar" aria-hidden="true">
								<span
									class="other"
									style:width={share(state.houseVotes.other, state.houseVotes.total)}
								></span>
							</div>
						</li>
					{/if}
				</ul>
				{#if priorHouse.flips}
					<p class="note">
						{priorHouse.flips}
						{priorHouse.flips === 1 ? 'district' : 'districts'} changed party from the 2024 district with
						the same number.
					</p>
				{/if}
				{#if state.linesChanged}
					<p class="warn">
						Some district lines changed after 2024, so a seat or margin change is not a swing for
						those districts.
					</p>
				{/if}
			</section>
			<section>
				<h3>2024</h3>
				<p>
					House, statewide: {formatMargin(priorHouse.demMargin)}
					· {priorHouse.dem} Democratic seats · {priorHouse.rep} Republican seats
					{#if priorHouse.other}· {priorHouse.other} other{/if}
					{#if priorHouse.uncontested}· {priorHouse.uncontested} uncontested{/if}
				</p>
				<ul>
					<li>
						<div class="who">
							<span>Democratic</span><span class="dem">{formatVotes(priorHouse.demVotes)}</span>
						</div>
						<div class="bar" aria-hidden="true">
							<span class="dem" style:width={share(priorHouse.demVotes, priorHouse.totalVotes)}
							></span>
						</div>
					</li>
					<li>
						<div class="who">
							<span>Republican</span><span class="rep">{formatVotes(priorHouse.repVotes)}</span>
						</div>
						<div class="bar" aria-hidden="true">
							<span class="rep" style:width={share(priorHouse.repVotes, priorHouse.totalVotes)}
							></span>
						</div>
					</li>
					{#if priorHouse.otherVotes}
						<li>
							<div class="who">
								<span>Other</span><span class="other">{formatVotes(priorHouse.otherVotes)}</span>
							</div>
							<div class="bar" aria-hidden="true">
								<span
									class="other"
									style:width={share(priorHouse.otherVotes, priorHouse.totalVotes)}
								></span>
							</div>
						</li>
					{/if}
				</ul>
				{#if state.linesChanged}
					<p class="note">
						Seat counts use the 2024 district number. The vote total is every House vote cast in the
						state.
					</p>
				{/if}
				{#if state.president2024}
					<p>
						President, statewide: {formatMargin(state.president2024.demMargin)}
						{#if state.president2024.winner}· {state.president2024.winner}{/if}
					</p>
					<ul>
						{#each state.president2024.candidates.slice(0, 4) as candidate (candidate.name)}
							<li>
								<div class="who">
									<span>{candidate.name}</span>
									<span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
								</div>
								<div class="nums">
									{formatVotes(candidate.votes)} · {candidate.percent}%
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
			<section>
				<h3>Districts</h3>
				<ul>
					{#each selection.districts as district (district.id)}
						<li>
							<button type="button" class="district" onclick={() => onSelectDistrict(district.id)}>
								<span>{district.name}</span>
								<span class={district.called ? district.bucket : 'pending'}>
									{district.called ? formatMargin(district.demMargin) : 'Not called'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if race}
			<section>
				<h3>2026</h3>
				<ul>
					{#each race.candidates as candidate (candidate.name + candidate.party)}
						<li class={{ winner: candidate.winner }}>
							<div class="who">
								<span>{candidate.name}</span>
								<span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
							</div>
							<div class="bar" aria-hidden="true">
								<span class={candidate.bucket} style:width={(candidate.percent ?? 0) + '%'}></span>
							</div>
							<div class="nums">
								{formatVotes(candidate.votes)}
								{#if candidate.percent != null}
									· {candidate.percent}%
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				{#if place && place.incumbent}
					<p class="note">
						Incumbent {place.incumbent}
						{#if place.incumbentParty}({partyLabel(place.incumbentParty)}){/if}
						{#if place.incumbentResult}· {place.incumbentResult}{/if}
					</p>
				{/if}
				{#if race.url}
					<p class="note">
						<a href={race.url} target="_blank" rel="noreferrer">Race page on Polling Desk</a>
					</p>
				{/if}
			</section>
		{/if}

		{#if selection.type !== 'house-state'}
			<section>
				<h3>2024</h3>
				{#if selection.type === 'district' && place}
					{#if place.president2024}
						<p>
							President, this district: {formatMargin(place.president2024.demMargin)}
							{#if place.president2024.winner}· {place.president2024.winner}{/if}
						</p>
						<ul>
							{#each place.president2024.candidates as candidate (candidate.name)}
								<li>
									<div class="who">
										<span>{candidate.name === 'Other' ? 'Other candidates' : candidate.name}</span>
										{#if candidate.name !== 'Other'}
											<span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
										{/if}
									</div>
									<div class="nums">
										{formatVotes(candidate.votes)} · {candidate.percent}%
									</div>
								</li>
							{/each}
						</ul>
						{#if place.swingVsPresident != null}
							<p class="shift">
								{comparedWith(
									place.swingVsPresident,
									'the 2024 presidential vote in this district'
								)}{place.called ? '.' : ', with votes still out.'}
							</p>
						{/if}
					{:else}
						<p>2024 presidential vote for this district is not in the district file.</p>
					{/if}
					{#if place.linesChanged}
						<p class="warn">
							These district lines changed after 2024. The House result below is the old district
							with this number, so that margin is not a swing on these lines.
						</p>
					{/if}
					{#if place.house2024}
						{#if place.house2024.uncontested}
							<p>
								House: uncontested. {place.house2024.winner}
								{#if place.house2024.party}({partyLabel(place.house2024.party)}){/if}
								ran without a major-party opponent.
							</p>
						{:else}
							<p>
								House, {place.linesChanged ? 'same district number' : 'this district'}: {formatMargin(
									place.house2024.demMargin
								)}
								{#if place.house2024.winner}· {place.house2024.winner}{/if}
							</p>
							<ul>
								{#each place.house2024.candidates as candidate (candidate.name)}
									<li>
										<div class="who">
											<span>{candidate.name}</span>
											<span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
										</div>
										<div class="nums">
											{formatVotes(candidate.votes)} · {candidate.percent}%
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<p>2024 House result is not in the MIT file for this district number.</p>
					{/if}
					{#if place.swing != null}
						<p class="shift">
							{comparedWith(place.swing, 'the 2024 House vote in this district')}{place.called
								? '.'
								: ', with votes still out.'}
						</p>
					{/if}
				{:else if selection.type === 'state' && selection.office === 'senate'}
					{#if state.senate2024.length}
						{#each state.senate2024 as prior (prior.winner + String(prior.special))}
							<p>
								Senate{prior.special ? ' special' : ''}: {formatMargin(prior.demMargin)}
								{#if prior.winner}· {prior.winner}{/if}
							</p>
						{/each}
					{:else}
						<p>This state did not elect a senator in 2024.</p>
					{/if}
					{#if race?.swingVsPresident != null}
						<p class="shift">
							Against the 2024 presidential vote here, {formatShift(race.swingVsPresident)}.
						</p>
					{/if}
				{:else if race?.swingVsPresident != null}
					<p class="shift">
						Against the 2024 presidential vote here, {formatShift(race.swingVsPresident)}.
					</p>
				{/if}

				{#if selection.type !== 'district' && state.president2024}
					<p>
						President, statewide: {formatMargin(state.president2024.demMargin)}
						{#if state.president2024.winner}· {state.president2024.winner}{/if}
					</p>
					<ul>
						{#each state.president2024.candidates.slice(0, 4) as candidate (candidate.name)}
							<li>
								<div class="who">
									<span>{candidate.name}</span>
									<span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
								</div>
								<div class="nums">
									{formatVotes(candidate.votes)} · {candidate.percent}%
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<p class="fine">
			Unofficial.
			{#if race?.updatedUtc}Updated {formatWhen(race.updatedUtc)}.{/if}
		</p>
	{/if}
</aside>

<style>
	aside {
		display: flex;
		flex: 0 0 min(400px, 46%);
		flex-direction: column;
		align-self: stretch;
		width: min(400px, 46%);
		min-width: 0;
		min-height: 0;
		max-height: 100%;
		background: #fffdf8;
		border-left: 1px solid #e3d9c8;
		overflow: auto;
	}

	header,
	section {
		padding: 18px 20px 8px;
	}

	header {
		border-bottom: 1px solid #e3d9c8;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	button {
		border: 1px solid #d9d0c2;
		background: transparent;
		color: #1b1914;
		padding: 4px 8px;
		cursor: pointer;
	}

	button.district {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		border: 0;
		padding: 0;
		text-align: left;
	}

	.pending {
		color: #5e584e;
	}

	.kicker,
	.meta,
	.note,
	.fine {
		color: #5e584e;
		font-size: 13px;
	}

	h2,
	h3,
	p {
		margin: 0 0 8px;
	}

	h2 {
		font-family: Palatino, 'Palatino Linotype', Georgia, serif;
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.03em;
		clear: both;
	}

	h3 {
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #5e584e;
	}

	.leader {
		font-size: 18px;
	}

	.margin {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		font-family: Palatino, 'Palatino Linotype', Georgia, serif;
		font-size: 28px;
	}

	.flip-counts {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 20px;
		font-variant-numeric: tabular-nums;
	}

	.flip-counts .name {
		font-family: 'Segoe UI', Candara, sans-serif;
		font-size: 13px;
		color: #5e584e;
	}

	.flag,
	.warn {
		background: #f6f0e2;
		border: 1px solid #e3d3a4;
		padding: 8px 10px;
	}

	.shift {
		font-weight: 650;
	}

	ul {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
	}

	li {
		padding: 8px 0;
		border-top: 1px solid #efe7da;
	}

	li.winner .who span:first-child {
		font-weight: 700;
	}

	.who,
	.nums {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}

	.nums {
		color: #5e584e;
		font-variant-numeric: tabular-nums;
		font-size: 13px;
	}

	.bar {
		height: 6px;
		background: #efeae2;
		margin: 6px 0;
	}

	.bar span {
		display: block;
		height: 100%;
	}

	.dem {
		color: #2a5fbe;
	}

	.rep {
		color: #c4333c;
	}

	.other {
		color: #6e5a86;
	}

	.bar .dem {
		background: #2a5fbe;
	}

	.bar .rep {
		background: #c4333c;
	}

	.bar .other {
		background: #6e5a86;
	}

	a {
		color: #1b1914;
	}

	.fine {
		padding: 0 20px 20px;
	}
</style>
