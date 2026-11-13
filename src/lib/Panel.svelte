<script>
  import { formatMargin, formatShift, formatVotes, formatWhen, partyLabel, statusLabel } from './format.js'

  let { selection, onClose, onDeselect, onSelectDistrict } = $props()

  const place = $derived(selection?.place ?? null)
  const state = $derived(selection?.type === 'district' ? selection.state : selection?.place)
  const race = $derived(selection?.type === 'district' ? selection.place : selection?.race)
  const officeName = $derived(
    selection?.type === 'district' || selection?.type === 'house-state'
      ? 'House'
      : selection?.office === 'senate'
        ? 'Senate'
        : 'Governor',
  )
  const priorHouse = $derived(selection?.type === 'house-state' ? tallyPriorHouse(selection.districts) : null)

  function tallyPriorHouse(districts) {
    const seats = { dem: 0, rep: 0, other: 0, missing: 0, uncontested: 0, flips: 0, demVotes: 0, repVotes: 0, otherVotes: 0, totalVotes: 0 }
    for (const district of districts) {
      if (district.flip) seats.flips += 1
      const prior = district.house2024
      if (!prior) {
        seats.missing += 1
        continue
      }
      if (prior.uncontested) seats.uncontested += 1
      if (prior.bucket === 'dem') seats.dem += 1
      else if (prior.bucket === 'rep') seats.rep += 1
      else seats.other += 1
      seats.demVotes += prior.demVotes ?? 0
      seats.repVotes += prior.repVotes ?? 0
      seats.otherVotes += prior.otherVotes ?? 0
      seats.totalVotes += prior.totalVotes ?? 0
    }
    seats.demMargin = seats.totalVotes > 0 ? Math.round(((seats.demVotes - seats.repVotes) / seats.totalVotes) * 1000) / 10 : null
    return seats
  }

  function comparedWith(value, baseline) {
    const shift = formatShift(value)
    if (!shift) return null
    if (shift.startsWith('Essentially')) return `Essentially unchanged from ${baseline}`
    return shift.replace('than 2024', `than ${baseline}`)
  }

  function share(part, total) {
    if (!total) return '0%'
    return `${Math.round((part / total) * 1000) / 10}%`
  }
</script>

<aside class={{ open: Boolean(selection) }} aria-label="Election details">
  {#if selection && state}
    {#key selection.type === 'district' ? place.id : `${selection.type}:${state.postal}`}
      <span {@attach (node) => node.closest('aside')?.scrollTo(0, 0)}></span>
    {/key}
    <header>
      <div class="actions">
        {#if selection.type === 'district'}
          <button type="button" onclick={onDeselect}>Deselect district</button>
        {/if}
        <button type="button" onclick={onClose}>Close</button>
      </div>
      <p class="kicker">{officeName} · {selection.type === 'house-state' ? 'Statewide' : race ? statusLabel(race.status) : 'No 2026 race'}</p>
      <h2>{selection.type === 'district' ? place.name : state.name}</h2>
      {#if race}
        <p class="leader">
          {race.called ? 'Winner' : 'Leader'}: {race.leader}
          <span class={race.bucket}>{partyLabel(race.party)}</span>
        </p>
        <p class="margin">{race.called ? formatMargin(race.demMargin) : `${formatMargin(race.demMargin)} so far`}</p>
        {#if selection.type === 'district' && place.flip}
          <p class="flag">Party flip from the 2024 district with this number</p>
        {/if}
        <p class="meta">
          {race.percentReporting == null ? 'Reporting percent unavailable' : `${race.percentReporting}% reporting`}
          {#if selection.type === 'district' && place.votesLeft && !place.called}
            · about {formatVotes(place.votesLeft)} votes left
          {/if}
        </p>
      {:else if selection.type === 'house-state'}
        <p class="leader">
          {state.houseSeats.dem} Democratic · {state.houseSeats.rep} Republican
          {#if state.houseSeats.other}· {state.houseSeats.other} other{/if}
          {#if state.houseSeats.uncalled}· {state.houseSeats.uncalled} not called{/if}
        </p>
        <p class="margin">{formatMargin(state.houseVotes.demMargin)}</p>
        <p class="meta">Democratic margin of House votes counted in {state.name}.</p>
      {:else}
        <p class="leader">No {officeName.toLowerCase()} election in {state.name} in 2026.</p>
      {/if}
    </header>

    {#if selection.type === 'house-state'}
      <section>
        <h3>2026 House votes</h3>
        <ul>
          <li>
            <div class="who">
              <span>Democratic</span>
              <span class="dem">{formatVotes(state.houseVotes.dem)}</span>
            </div>
            <div class="bar" aria-hidden="true"><span class="dem" style:width={share(state.houseVotes.dem, state.houseVotes.total)}></span></div>
          </li>
          <li>
            <div class="who">
              <span>Republican</span>
              <span class="rep">{formatVotes(state.houseVotes.rep)}</span>
            </div>
            <div class="bar" aria-hidden="true"><span class="rep" style:width={share(state.houseVotes.rep, state.houseVotes.total)}></span></div>
          </li>
          {#if state.houseVotes.other}
            <li>
              <div class="who">
                <span>Other</span>
                <span class="other">{formatVotes(state.houseVotes.other)}</span>
              </div>
              <div class="bar" aria-hidden="true"><span class="other" style:width={share(state.houseVotes.other, state.houseVotes.total)}></span></div>
            </li>
          {/if}
        </ul>
        {#if priorHouse.flips}
          <p class="note">{priorHouse.flips} {priorHouse.flips === 1 ? 'district' : 'districts'} changed party from the 2024 district with the same number.</p>
        {/if}
        {#if state.linesChanged}
          <p class="warn">Some district lines changed after 2024, so a seat or margin change is not a swing for those districts.</p>
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
            <div class="who"><span>Democratic</span><span class="dem">{formatVotes(priorHouse.demVotes)}</span></div>
            <div class="bar" aria-hidden="true"><span class="dem" style:width={share(priorHouse.demVotes, priorHouse.totalVotes)}></span></div>
          </li>
          <li>
            <div class="who"><span>Republican</span><span class="rep">{formatVotes(priorHouse.repVotes)}</span></div>
            <div class="bar" aria-hidden="true"><span class="rep" style:width={share(priorHouse.repVotes, priorHouse.totalVotes)}></span></div>
          </li>
          {#if priorHouse.otherVotes}
            <li>
              <div class="who"><span>Other</span><span class="other">{formatVotes(priorHouse.otherVotes)}</span></div>
              <div class="bar" aria-hidden="true"><span class="other" style:width={share(priorHouse.otherVotes, priorHouse.totalVotes)}></span></div>
            </li>
          {/if}
        </ul>
        {#if state.linesChanged}
          <p class="note">Seat counts use the 2024 district number. The vote total is every House vote cast in the state.</p>
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
                <div class="nums">{formatVotes(candidate.votes)} · {candidate.percent}%</div>
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
                <span class={candidate.bucket} style:width="{(candidate.percent ?? 0) + '%'}"></span>
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
        {#if selection.type === 'district' && place.incumbent}
          <p class="note">
            Incumbent {place.incumbent}
            {#if place.incumbentParty}({partyLabel(place.incumbentParty)}){/if}
            {#if place.incumbentResult}· {place.incumbentResult}{/if}
          </p>
        {/if}
        {#if race.url}
          <p class="note"><a href={race.url} target="_blank" rel="noreferrer">Race page on Polling Desk</a></p>
        {/if}
      </section>
    {/if}

    {#if selection.type !== 'house-state'}
    <section>
      <h3>2024</h3>
      {#if selection.type === 'district'}
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
                <div class="nums">{formatVotes(candidate.votes)} · {candidate.percent}%</div>
              </li>
            {/each}
          </ul>
          {#if place.swingVsPresident != null}
            <p class="shift">{comparedWith(place.swingVsPresident, 'the 2024 presidential vote in this district')}{place.called ? '.' : ', with votes still out.'}</p>
          {/if}
        {:else}
          <p>2024 presidential vote for this district is not in the district file.</p>
        {/if}
        {#if place.linesChanged}
          <p class="warn">
            These district lines changed after 2024. The House result below is the old district with this number, so
            that margin is not a swing on these lines.
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
              House, {place.linesChanged ? 'same district number' : 'this district'}: {formatMargin(place.house2024.demMargin)}
              {#if place.house2024.winner}· {place.house2024.winner}{/if}
            </p>
            <ul>
              {#each place.house2024.candidates as candidate (candidate.name)}
                <li>
                  <div class="who">
                    <span>{candidate.name}</span>
                    <span class={candidate.bucket}>{partyLabel(candidate.party)}</span>
                  </div>
                  <div class="nums">{formatVotes(candidate.votes)} · {candidate.percent}%</div>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <p>2024 House result is not in the MIT file for this district number.</p>
        {/if}
        {#if place.swing != null}
          <p class="shift">{comparedWith(place.swing, 'the 2024 House vote in this district')}{place.called ? '.' : ', with votes still out.'}</p>
        {/if}
        {:else if selection.office === 'senate'}
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
          <p class="shift">Against the 2024 presidential vote here, {formatShift(race.swingVsPresident)}.</p>
        {/if}
      {:else if race?.swingVsPresident != null}
        <p class="shift">Against the 2024 presidential vote here, {formatShift(race.swingVsPresident)}.</p>
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
              <div class="nums">{formatVotes(candidate.votes)} · {candidate.percent}%</div>
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
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, 100%);
    background: #fffdf8;
    border-left: 1px solid #e3d9c8;
    box-shadow: -12px 0 32px rgba(40, 30, 10, 0.08);
    transform: translateX(104%);
    transition: transform 180ms ease;
    overflow: auto;
    z-index: 2;
  }

  aside.open {
    transform: translateX(0);
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
    font-family: Palatino, 'Palatino Linotype', Georgia, serif;
    font-size: 28px;
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
