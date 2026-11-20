const PARTY_NAMES: Record<string, string> = {
	DEM: 'Democratic',
	D: 'Democratic',
	DFL: 'Democratic',
	REP: 'Republican',
	R: 'Republican',
	GOP: 'Republican',
	OTH: 'Other',
	IND: 'Independent',
	LIB: 'Libertarian',
	GRN: 'Green',
	WFP: 'Working Families'
};

export function partyLabel(party: string | null | undefined) {
	const key = String(party || '').toUpperCase();
	if (PARTY_NAMES[key]) return PARTY_NAMES[key];
	if (key.startsWith('DEM')) return 'Democratic';
	if (key.startsWith('REP')) return 'Republican';
	if (!party) return 'Other';
	if (party === party.toUpperCase()) {
		return party.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
	}
	return party;
}

export function formatMargin(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return '—';
	if (Math.abs(value) < 0.05) return 'Even';
	const points = Math.abs(value).toFixed(1);
	return value > 0 ? `D+${points}` : `R+${points}`;
}

export function formatShift(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) return null;
	if (Math.abs(value) < 0.05) return 'Essentially unchanged from 2024';
	const points = Math.abs(value).toFixed(1);
	return value > 0
		? `${points} points more Democratic than 2024`
		: `${points} points more Republican than 2024`;
}

export function formatVotes(value: number | null | undefined) {
	return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatWhen(value: string | null | undefined) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return `${new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	}).format(date)} UTC`;
}

export function statusLabel(status: string) {
	if (status === 'called') return 'Called';
	if (status === 'runoff') return 'Runoff';
	return 'Not called';
}
