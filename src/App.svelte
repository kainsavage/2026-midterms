<script>
  import MapView from './lib/MapView.svelte'
  import Panel from './lib/Panel.svelte'
  import { election, statesGeo } from './lib/data.js'
  import { formatWhen } from './lib/format.js'

  let office = $state('house')
  let mode = $state('winner')
  let stateId = $state(null)
  let districtId = $state(null)
  let query = $state('')

  const state = $derived(stateId ? election.states[stateId] : null)
  const district = $derived(districtId ? election.districts[districtId] : null)
  const stateDistricts = $derived(
    state
      ? Object.values(election.districts)
          .filter((item) => item.state === state.postal)
          .sort((a, b) => a.district - b.district)
      : [],
  )
  const selection = $derived.by(() => {
    if (!state) return null
    if (office === 'house' && district) return { type: 'district', place: district, state: election.states[district.state] }
    if (office === 'house') return { type: 'house-state', place: state, districts: stateDistricts }
    return {
      type: 'state',
      office,
      place: state,
      race: office === 'senate' ? state.senate2026 : state.governor2026,
    }
  })

  const places = $derived(Object.values(election.states).sort((a, b) => a.name.localeCompare(b.name)))
  const districts = $derived(Object.values(election.districts).sort((a, b) => a.id.localeCompare(b.id)))

  function onKey(event) {
    if (event.key !== 'Escape' || event.target instanceof HTMLInputElement) return
    if (districtId) districtId = null
    else stateId = null
  }

  function chooseOffice(next) {
    office = next
    if (next !== 'house') districtId = null
  }

  function selectState(postal) {
    if (stateId !== postal) districtId = null
    stateId = postal
  }

  function selectDistrict(id) {
    const race = election.districts[id]
    if (!race) return
    stateId = race.state
    districtId = districtId === id ? null : id
  }

  function deselectDistrict() {
    districtId = null
  }

  function backToNation() {
    stateId = null
    districtId = null
  }

  function closePanel() {
    stateId = null
    districtId = null
  }

  function goTo(event) {
    event.preventDefault()
    const text = query.trim().toLowerCase().replace(/\./g, '')
    const districtMatch = text.match(/^([a-z]{2})[-\s]?(\d+|al)$/)
    if (districtMatch) {
      const postal = districtMatch[1].toUpperCase()
      const number = districtMatch[2] === 'al' ? 1 : Number(districtMatch[2])
      const id = `${postal}-${number}`
      if (election.districts[id]) {
        office = 'house'
        stateId = postal
        districtId = id
        query = ''
        return
      }
    }
    const match = Object.values(election.states).find(
      (item) => item.postal.toLowerCase() === text || item.name.toLowerCase() === text,
    )
    if (match) {
      stateId = match.postal
      districtId = null
      query = ''
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header>
    <div class="title">
      <p>United States</p>
      <h1>2026 midterms, beside 2024</h1>
    </div>
    <div class="controls">
      <div class="segment" role="group" aria-label="Office">
        {#each [['house', 'House'], ['senate', 'Senate'], ['governor', 'Governor']] as [id, label] (id)}
          <button type="button" aria-pressed={office === id} onclick={() => chooseOffice(id)}>{label}</button>
        {/each}
      </div>
      <div class="segment" role="group" aria-label="Shading">
        <button type="button" aria-pressed={mode === 'winner'} onclick={() => (mode = 'winner')}>Winner</button>
        <button type="button" aria-pressed={mode === 'margin'} onclick={() => (mode = 'margin')}>Margin</button>
      </div>
      <form onsubmit={goTo}>
        <input
          list="places"
          bind:value={query}
          placeholder="State or district"
          aria-label="Jump to a state or district"
        />
        <button type="submit">Go</button>
      </form>
      <datalist id="places">
        {#each places as item (item.postal)}
          <option value={item.name}>{item.postal}</option>
        {/each}
        {#each districts as item (item.id)}
          <option value={item.id}>{item.name}</option>
        {/each}
      </datalist>
    </div>
  </header>

  <main>
    {#if state}
      <nav class="crumbs" aria-label="Map location">
        <button type="button" onclick={backToNation}>All states</button>
        {#if district}
          <button type="button" onclick={() => (districtId = null)}>{state.name}</button>
          <span>{district.name}</span>
        {:else}
          <span>{state.name}</span>
        {/if}
        {#if office === 'house'}
          <span class="seats">
            {state.houseSeats.dem} D · {state.houseSeats.rep} R
            {#if state.houseSeats.other}· {state.houseSeats.other} other{/if}
            {#if state.houseSeats.uncalled}· {state.houseSeats.uncalled} not called{/if}
          </span>
        {/if}
        {#if state.linesChanged && office === 'house'}
          <span class="seats">Lines differ from 2024</span>
        {/if}
      </nav>
    {/if}

    <MapView
      {office}
      {mode}
      {stateId}
      {districtId}
      {election}
      {statesGeo}
      onSelectState={selectState}
      onSelectDistrict={selectDistrict}
    />
    <Panel {selection} onClose={closePanel} onDeselect={deselectDistrict} onSelectDistrict={selectDistrict} />
  </main>

  <footer>
    Unofficial results as of {formatWhen(election.sources.resultsUpdatedUtc)}.
    {election.sources.resultsSource}
    2024 comparisons: {election.sources.historySource}
    Boundaries: {election.sources.districtSource}; {election.sources.stateSource}.
  </footer>
</div>

<style>
  .app {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: #f3efe6;
    color: #1b1914;
  }

  header,
  footer {
    padding: 12px 18px;
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: end;
    border-bottom: 1px solid #e3d9c8;
  }

  .title p,
  footer {
    margin: 0;
    color: #5e584e;
    font-size: 13px;
    line-height: 1.45;
  }

  h1 {
    margin: 0;
    font-family: Palatino, 'Palatino Linotype', Georgia, serif;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.03em;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  .segment {
    display: flex;
    border: 1px solid #d9d0c2;
    background: #fffdf8;
  }

  button,
  input {
    font: inherit;
    color: inherit;
  }

  .segment button,
  form button {
    border: 0;
    background: transparent;
    padding: 7px 10px;
    cursor: pointer;
  }

  .segment button[aria-pressed='true'] {
    background: #1b1914;
    color: #f3efe6;
  }

  form {
    display: flex;
    border: 1px solid #d9d0c2;
    background: #fffdf8;
  }

  input {
    border: 0;
    background: transparent;
    padding: 7px 10px;
    width: 180px;
  }

  input:focus,
  button:focus-visible {
    outline: 2px solid #1b1914;
    outline-offset: -2px;
  }

  main {
    position: relative;
    min-height: 0;
  }

  .crumbs {
    position: absolute;
    z-index: 1;
    top: 12px;
    left: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 6px;
    background: rgba(255, 253, 248, 0.94);
    border: 1px solid #e3d9c8;
  }

  .crumbs button {
    border: 0;
    background: transparent;
    padding: 4px 6px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .seats {
    color: #5e584e;
    font-size: 13px;
    padding-right: 6px;
  }

  footer {
    border-top: 1px solid #e3d9c8;
  }

  @media (max-width: 800px) {
    header {
      align-items: stretch;
      flex-direction: column;
    }

    .controls {
      justify-content: flex-start;
    }

    h1 {
      font-size: 24px;
    }
  }
</style>
