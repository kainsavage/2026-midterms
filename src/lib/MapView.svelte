<script>
  import { geoAlbersUsa, geoMercator, geoPath } from 'd3-geo'
  import { colorHouseState, colorRace, PARTY } from './color.js'
  import { districtsFor } from './data.js'
  import { formatMargin } from './format.js'
  import { shiftAlaska } from './geo.js'

  let { office, mode, stateId, districtId, election, statesGeo, onSelectState, onSelectDistrict } = $props()

  let width = $state(0)
  let height = $state(0)
  let hover = $state(null)
  let hoverKey = $state('')
  const viewKey = $derived(`${office}|${stateId ?? ''}|${districtId ?? ''}`)

  const districtGeo = $derived(office === 'house' && stateId ? districtsFor(stateId) : null)

  function watchSize(node) {
    const observer = new ResizeObserver(() => {
      width = node.clientWidth
      height = node.clientHeight
    })
    observer.observe(node)
    width = node.clientWidth
    height = node.clientHeight
    return () => observer.disconnect()
  }

  const scene = $derived.by(() => {
    if (width < 20 || height < 20) return null
    if (office === 'house' && stateId) {
      const geo = districtGeo
      if (!geo || !geo.features.length) {
        const stateFeature = statesGeo.features.find((feature) => feature.properties.postal === stateId)
        if (!stateFeature) return null
        const projection = geoMercator().fitExtent(
          [
            [28, 28],
            [width - 28, height - 28],
          ],
          shiftAlaska(stateFeature),
        )
        return {
          kind: 'state',
          features: [shiftAlaska(stateFeature)],
          path: geoPath(projection),
          empty: Boolean(geo) && geo.features.length === 0,
        }
      }
      const projection = geoMercator().fitExtent(
        [
          [28, 28],
          [width - 28, height - 28],
        ],
        geo,
      )
      return { kind: 'districts', features: geo.features, path: geoPath(projection), empty: false }
    }
    if (stateId && office !== 'house') {
      const stateFeature = statesGeo.features.find((feature) => feature.properties.postal === stateId)
      if (!stateFeature) return null
      const shifted = shiftAlaska(stateFeature)
      const projection = geoMercator().fitExtent(
        [
          [36, 36],
          [width - 36, height - 36],
        ],
        shifted,
      )
      return { kind: 'one-state', features: [shifted], path: geoPath(projection), empty: false }
    }
    const projection = geoAlbersUsa().fitExtent(
      [
        [8, 8],
        [width - 8, height - 8],
      ],
      statesGeo,
    )
    return { kind: 'nation', features: statesGeo.features, path: geoPath(projection), empty: false }
  })

  const legend = $derived.by(() => {
    const drilled = office === 'house' && stateId
    if (mode === 'margin') {
      return drilled || office !== 'house'
        ? 'Democratic margin where the race is called. Gray means not called or no race.'
        : 'Democratic margin of House votes counted. Gray means no votes reported.'
    }
    return drilled || office !== 'house'
      ? 'Called winner. Gray means not called or no race.'
      : 'Party that won more called House seats. Gray means a tie or no seats called.'
  })

  function fill(kind, feature) {
    if (kind === 'districts') return colorRace(election.districts[feature.properties.id], mode)
    const state = election.states[feature.properties.postal]
    if (office === 'house' && kind !== 'one-state') return colorHouseState(state, mode)
    if (office === 'senate') return colorRace(state?.senate2026, mode)
    if (office === 'governor') return colorRace(state?.governor2026, mode)
    return colorHouseState(state, mode)
  }

  function label(kind, feature) {
    if (kind === 'districts') {
      const race = election.districts[feature.properties.id]
      if (!race) return feature.properties.id
      const result = race.called ? formatMargin(race.demMargin) : 'Not called'
      return `${race.name}. ${race.leader}. ${result}`
    }
    const state = election.states[feature.properties.postal]
    if (!state) return feature.properties.name
    if (office === 'house') {
      const seats = state.houseSeats
      const other = seats.other ? `, ${seats.other} other` : ''
      const waiting = seats.uncalled ? `, ${seats.uncalled} not called` : ''
      return `${state.name}. House ${seats.dem} Democratic, ${seats.rep} Republican${other}${waiting}`
    }
    const race = office === 'senate' ? state.senate2026 : state.governor2026
    if (!race) return `${state.name}. No ${office} election in 2026`
    const result = race.called ? formatMargin(race.demMargin) : 'Not called'
    return `${state.name}. ${race.leader}. ${result}`
  }

  function choose(kind, feature) {
    if (kind === 'districts') onSelectDistrict(feature.properties.id)
    else onSelectState(feature.properties.postal)
  }

  function stroke(kind, feature) {
    if (kind === 'districts' && feature.properties.id === districtId) return '#1b1914'
    if (kind === 'districts') {
      const race = election.districts[feature.properties.id]
      if (race?.flip && race.called) return '#8a6a12'
    }
    if (kind !== 'districts' && feature.properties.postal === stateId && kind === 'nation') return '#1b1914'
    return 'rgba(255, 255, 255, 0.85)'
  }

  function strokeWidth(kind, feature) {
    if (kind === 'districts' && feature.properties.id === districtId) return 2.6
    if (kind === 'districts' && election.districts[feature.properties.id]?.flip && election.districts[feature.properties.id]?.called) return 2
    return kind === 'nation' ? 0.75 : 1.1
  }
</script>

<div class="map-host" {@attach watchSize}>
  {#if scene}
    <svg viewBox="0 0 {width} {height}" role="img" aria-label="Map of 2026 election results">
      {#each scene.features as feature (feature.properties.id || feature.properties.postal)}
        {@const d = scene.path(feature)}
        {#if d}
          <path
            {d}
            fill={fill(scene.kind, feature)}
            stroke={stroke(scene.kind, feature)}
            stroke-width={strokeWidth(scene.kind, feature)}
            stroke-linejoin="round"
            role="button"
            tabindex="-1"
            aria-label={label(scene.kind, feature)}
            onclick={() => choose(scene.kind, feature)}
            onkeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                choose(scene.kind, feature)
              }
            }}
            onpointerenter={() => {
              hover = label(scene.kind, feature)
              hoverKey = viewKey
            }}
            onpointerleave={() => (hover = null)}
          />
        {/if}
      {/each}
    </svg>
  {/if}

  <div class="map-chrome">
    <p class="hover" aria-live="polite">
      {hoverKey === viewKey && hover ? hover : scene?.empty ? 'No voting House district' : 'Click a state or district'}
    </p>
    <div class="legend">
      {#if mode === 'winner'}
        <span><i style:background={PARTY.dem}></i> Democratic</span>
        <span><i style:background={PARTY.rep}></i> Republican</span>
        <span><i style:background={PARTY.other}></i> Other or tie</span>
        <span><i style:background={PARTY.none}></i> Not called</span>
      {:else}
        <span class="scale" aria-hidden="true"></span>
        <span>R+30</span>
        <span>Even</span>
        <span>D+30</span>
      {/if}
      {#if office === 'house' && stateId}
        <span><i class="flip"></i> Flip</span>
      {/if}
      <p>{legend}</p>
    </div>
  </div>
</div>

<style>
  .map-host {
    position: relative;
    height: 100%;
    background: #d7e3ea;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  path {
    cursor: pointer;
  }

  path:hover,
  path:focus-visible {
    stroke: #1b1914;
  }

  .map-chrome {
    position: absolute;
    left: 16px;
    bottom: 14px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    max-width: min(460px, calc(100% - 32px));
    pointer-events: none;
  }

  .hover,
  .legend {
    margin: 0;
    padding: 8px 10px;
    background: rgba(255, 253, 248, 0.92);
    border: 1px solid #e3d9c8;
    color: #1b1914;
    font-size: 13px;
    line-height: 1.35;
  }

  .hover {
    max-width: 42ch;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    max-width: 460px;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend p {
    flex-basis: 100%;
    margin: 0;
    color: #5e584e;
  }

  .legend i {
    width: 12px;
    height: 12px;
    display: inline-block;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .legend i.flip {
    background: transparent;
    border: 2px solid #8a6a12;
  }

  .scale {
    width: 120px;
    height: 12px;
    background: linear-gradient(90deg, #a32020, #e7e8ec, #1d4e9e);
    border: 1px solid rgba(0, 0, 0, 0.15);
  }
</style>
