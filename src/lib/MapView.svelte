<script>
  import { untrack } from 'svelte'
  import { geoAlbersUsa, geoMercator, geoPath } from 'd3-geo'
  import { cubicInOut } from 'svelte/easing'
  import { prefersReducedMotion } from 'svelte/motion'
  import { colorHouseState, colorRace, PARTY } from './color.js'
  import { districtsFor } from './data.js'
  import { formatMargin } from './format.js'
  import { shiftAlaska } from './geo.js'

  let { office, mode, stateId, districtId, election, statesGeo, onSelectState, onSelectDistrict, onStepBack } = $props()

  let width = $state(0)
  let height = $state(0)
  let hover = $state(null)
  let hoverKey = $state('')
  let pointerTarget = $state(null)
  let pointerView = $state('')
  let focusTarget = $state(null)
  let focusView = $state('')
  let flight = $state.raw(null)
  let flightT = $state(1)
  const viewKey = $derived(`${office}|${stateId ?? ''}|${districtId ?? ''}`)

  let committed = null
  let flightGen = 0
  let raf = 0

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

  function nationProjector() {
    return geoAlbersUsa().fitExtent(
      [
        [8, 8],
        [width - 8, height - 8],
      ],
      statesGeo,
    )
  }

  function layout(whichOffice, whichState) {
    if (width < 20 || height < 20) return null
    if (whichOffice === 'house' && whichState) {
      const geo = districtsFor(whichState)
      if (!geo.features.length) {
        const stateFeature = statesGeo.features.find((feature) => feature.properties.postal === whichState)
        if (!stateFeature) return null
        const feature = shiftAlaska(stateFeature)
        const projection = geoMercator().fitExtent(
          [
            [28, 28],
            [width - 28, height - 28],
          ],
          feature,
        )
        return { kind: 'state', features: [feature], path: geoPath(projection), empty: true }
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
    if (whichState && whichOffice !== 'house') {
      const stateFeature = statesGeo.features.find((feature) => feature.properties.postal === whichState)
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
    return { kind: 'nation', features: statesGeo.features, path: geoPath(nationProjector()), empty: false }
  }

  const scene = $derived(layout(office, stateId))

  function boxOf(bounds) {
    const x0 = bounds[0][0]
    const y0 = bounds[0][1]
    const x1 = bounds[1][0]
    const y1 = bounds[1][1]
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }
  }

  function validBox(box) {
    return Boolean(box) && [box.cx, box.cy, box.w, box.h].every(Number.isFinite) && box.w > 2 && box.h > 2
  }

  function bake(whichOffice, whichState) {
    const view = layout(whichOffice, whichState)
    if (!view) return null
    const shapes = []
    for (const feature of view.features) {
      const d = view.path(feature)
      if (!d) continue
      shapes.push({
        key: feature.properties.id || feature.properties.postal,
        d,
        fill: fill(view.kind, feature, whichOffice),
        stroke: stroke(view.kind, feature, false),
        strokeWidth: strokeWidth(view.kind, feature),
      })
    }
    if (!shapes.length) return null
    const bounds = boxOf(view.path.bounds({ type: 'FeatureCollection', features: view.features }))
    let anchor = null
    if (whichState) {
      const feature = statesGeo.features.find((item) => item.properties.postal === whichState)
      if (feature) anchor = boxOf(geoPath(nationProjector()).bounds(feature))
    }
    return { shapes, bounds, anchor, stateId: whichState }
  }

  function stageBetween(from, to) {
    if (!from || !to) return null
    const focused = from.stateId ? from : to
    if (!validBox(focused.anchor) || !validBox(focused.bounds)) return null
    const S = Math.min(focused.bounds.w / focused.anchor.w, focused.bounds.h / focused.anchor.h)
    if (!Number.isFinite(S) || S <= 0) return null
    const zoom = Math.max(S, 1 / S)
    return {
      out: from,
      in: to,
      anchor: focused.anchor,
      content: focused.bounds,
      grow: !from.stateId,
      S,
      duration: Math.round(Math.min(1100, 720 + Math.log2(zoom) * 120)),
    }
  }

  function stagesBetween(fromOffice, fromState, toOffice, toState) {
    if (fromState && toState && fromState !== toState) {
      const from = bake(fromOffice, fromState)
      const to = bake(toOffice, toState)
      const nation = bake(fromOffice, null)
      const nationNext = fromOffice === toOffice ? nation : bake(toOffice, null)
      return [stageBetween(from, nation), stageBetween(nationNext, to)].filter(Boolean)
    }
    const stage = stageBetween(bake(fromOffice, fromState), bake(toOffice, toState))
    return stage ? [stage] : []
  }

  function camera(origin, fromCenter, toCenter, fromScale, toScale, u) {
    const s = fromScale + (toScale - fromScale) * u
    const x = fromCenter.cx + (toCenter.cx - fromCenter.cx) * u
    const y = fromCenter.cy + (toCenter.cy - fromCenter.cy) * u
    const n = (value) => Math.round(value * 1000) / 1000
    return `translate(${n(x)} ${n(y)}) scale(${n(s)}) translate(${n(-origin.cx)} ${n(-origin.cy)})`
  }

  function ramp(u, start, end) {
    const x = Math.min(1, Math.max(0, (u - start) / (end - start)))
    return x * x * (3 - 2 * x)
  }

  const motion = $derived.by(() => {
    if (!flight) return null
    const { anchor, content, grow, S } = flight
    const u = flightT
    if (grow) {
      return {
        outTransform: camera(anchor, anchor, content, 1, S, u),
        inTransform: camera(content, anchor, content, 1 / S, 1, u),
        outOpacity: 1 - ramp(u, 0.64, 0.86),
        inOpacity: ramp(u, 0.58, 0.82),
      }
    }
    return {
      outTransform: camera(content, content, anchor, 1, 1 / S, u),
      inTransform: camera(anchor, content, anchor, S, 1, u),
      outOpacity: 1 - ramp(u, 0.64, 0.86),
      inOpacity: ramp(u, 0.58, 0.82),
    }
  })

  function animate(target, duration, gen) {
    cancelAnimationFrame(raf)
    const from = flightT
    const start = performance.now()
    return new Promise((resolve) => {
      const step = (now) => {
        if (gen !== flightGen) {
          resolve()
          return
        }
        const p = Math.min(1, (now - start) / duration)
        flightT = from + (target - from) * cubicInOut(p)
        if (p < 1) raf = requestAnimationFrame(step)
        else resolve()
      }
      raf = requestAnimationFrame(step)
    })
  }

  async function play(stages, gen) {
    for (const stage of stages) {
      if (gen !== flightGen) return
      flight = stage
      flightT = 0
      await animate(1, stage.duration, gen)
    }
    if (gen === flightGen) flight = null
  }

  function begin(previous, nextOffice, nextState) {
    const stages = stagesBetween(previous.office, previous.stateId, nextOffice, nextState)
    if (!stages.length) return
    const gen = ++flightGen
    void play(stages, gen)
  }

  // District selection keeps the same fitted map, so only a state-frame change flies.
  // The panel is always open, so the map column does not change size between views.
  $effect.pre(() => {
    const nextState = stateId ?? null
    const nextOffice = office
    if (width < 20 || height < 20) return
    if (!committed) {
      committed = { stateId: nextState, office: nextOffice }
      return
    }
    if (committed.stateId === nextState) {
      committed = { stateId: nextState, office: nextOffice }
      return
    }
    const previous = committed
    committed = { stateId: nextState, office: nextOffice }
    if (prefersReducedMotion.current) return
    untrack(() => begin(previous, nextOffice, nextState))
  })

  $effect(() => () => {
    flightGen += 1
    cancelAnimationFrame(raf)
  })

  const selectedOutline = $derived.by(() => {
    if (!scene || scene.kind !== 'districts' || !districtId) return null
    const feature = scene.features.find((item) => item.properties.id === districtId)
    return feature ? scene.path(feature) : null
  })

  const hoverOutline = $derived.by(() => {
    if (!scene) return null
    const id = pointerTarget && pointerView === viewKey ? pointerTarget : focusTarget && focusView === viewKey ? focusTarget : null
    if (!id || (scene.kind === 'districts' && id === districtId)) return null
    const feature = scene.features.find((item) => (item.properties.id || item.properties.postal) === id)
    if (!feature) return null
    const d = scene.path(feature)
    if (!d) return null
    return { d, width: Math.max(strokeWidth(scene.kind, feature), 2) }
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

  function fill(kind, feature, whichOffice = office) {
    if (kind === 'districts') return colorRace(election.districts[feature.properties.id], mode)
    const state = election.states[feature.properties.postal]
    if (whichOffice === 'house' && kind !== 'one-state') return colorHouseState(state, mode)
    if (whichOffice === 'senate') return colorRace(state?.senate2026, mode)
    if (whichOffice === 'governor') return colorRace(state?.governor2026, mode)
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

  function stroke(kind, feature, live = true) {
    if (kind === 'districts') {
      const race = election.districts[feature.properties.id]
      if (race?.flip && race.called) return '#8a6a12'
    }
    if (live && kind === 'nation' && feature.properties.postal === stateId) return '#1b1914'
    return 'rgba(255, 255, 255, 0.85)'
  }

  function strokeWidth(kind, feature) {
    if (kind === 'districts' && election.districts[feature.properties.id]?.flip && election.districts[feature.properties.id]?.called) return 2
    return kind === 'nation' ? 0.75 : 1.1
  }
</script>

<div class="map-host" {@attach watchSize}>
  {#if flight && motion}
    <svg class="flying" viewBox="0 0 {width} {height}" role="img" aria-busy="true" aria-label="Map of 2026 election results">
      <g transform={motion.outTransform} opacity={motion.outOpacity}>
        {@render drawn(flight.out.shapes)}
      </g>
      <g transform={motion.inTransform} opacity={motion.inOpacity}>
        {@render drawn(flight.in.shapes)}
      </g>
    </svg>
  {:else if scene}
    <svg viewBox="0 0 {width} {height}" role="img" aria-label="Map of 2026 election results">
      {#if stateId}
        <rect
          class="back"
          width={width}
          height={height}
          role="button"
          tabindex="-1"
          aria-label={districtId ? 'Show this state' : 'Show all states'}
          onclick={onStepBack}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onStepBack()
            }
          }}
        />
      {/if}
      {#each scene.features as feature (feature.properties.id || feature.properties.postal)}
        {@const d = scene.path(feature)}
        {#if d}
          <path
            class={{ dimmed: scene.kind === 'districts' && districtId && feature.properties.id !== districtId }}
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
              const id = feature.properties.id || feature.properties.postal
              hover = label(scene.kind, feature)
              hoverKey = viewKey
              pointerTarget = id
              pointerView = viewKey
            }}
            onpointerleave={() => {
              const id = feature.properties.id || feature.properties.postal
              if (pointerTarget === id) {
                pointerTarget = null
                hover = null
              }
            }}
            onfocus={() => {
              focusTarget = feature.properties.id || feature.properties.postal
              focusView = viewKey
            }}
            onblur={() => {
              const id = feature.properties.id || feature.properties.postal
              if (focusTarget === id) focusTarget = null
            }}
          />
        {/if}
      {/each}
      {#if hoverOutline}
        <path
          class="outline"
          d={hoverOutline.d}
          fill="none"
          stroke="#1b1914"
          stroke-width={hoverOutline.width}
          stroke-linejoin="round"
          pointer-events="none"
        />
      {/if}
      {#if selectedOutline}
        <path
          class="outline"
          d={selectedOutline}
          fill="none"
          stroke="#1b1914"
          stroke-width="2.6"
          stroke-linejoin="round"
          pointer-events="none"
        />
      {/if}
    </svg>
  {/if}

  {#snippet drawn(shapes)}
    {#each shapes as shape (shape.key)}
      <path
        d={shape.d}
        fill={shape.fill}
        stroke={shape.stroke}
        stroke-width={shape.strokeWidth}
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    {/each}
  {/snippet}

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
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: #d7e3ea;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  svg.flying {
    pointer-events: none;
  }

  svg.flying path {
    cursor: default;
    transition: none;
  }

  rect.back {
    fill: transparent;
    outline: none;
  }

  path {
    cursor: pointer;
    outline: none;
    transition: opacity 160ms ease;
  }

  path:focus,
  path:focus-visible {
    outline: none;
  }

  path.dimmed {
    opacity: 0.4;
  }

  path.dimmed:hover {
    opacity: 0.7;
  }

  path.outline {
    pointer-events: none;
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
