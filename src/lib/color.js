export const PARTY = {
  dem: '#2a5fbe',
  rep: '#c4333c',
  other: '#6e5a86',
  tie: '#8d7aa8',
  none: '#d5d8df',
}

export function marginColor(margin) {
  if (margin == null || Number.isNaN(margin)) return PARTY.none
  const t = Math.max(-1, Math.min(1, margin / 30))
  if (t >= 0) return mix('#e7e8ec', '#1d4e9e', t)
  return mix('#e7e8ec', '#a32020', -t)
}

export function colorRace(race, mode) {
  if (!race?.called) return PARTY.none
  if (mode === 'margin') return marginColor(race.demMargin)
  return PARTY[race.bucket] ?? PARTY.other
}

export function colorHouseState(state, mode) {
  if (!state) return PARTY.none
  if (mode === 'margin') {
    if (!state.houseVotes.total) return PARTY.none
    return marginColor(state.houseVotes.demMargin)
  }
  const seats = state.houseSeats
  const called = seats.dem + seats.rep + seats.other
  if (!called) return PARTY.none
  const top = Math.max(seats.dem, seats.rep, seats.other)
  const leaders = ['dem', 'rep', 'other'].filter((key) => seats[key] === top)
  if (leaders.length !== 1) return PARTY.tie
  return PARTY[leaders[0]]
}

function mix(from, to, t) {
  const start = hex(from)
  const end = hex(to)
  const channels = start.map((value, index) => Math.round(value + (end[index] - value) * t))
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`
}

function hex(value) {
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}
