# 2026 midterms beside 2024

A state and congressional-district map of the 2026 U.S. midterms, with each place set next to the 2024 general election.

The House view shades which party won more called seats. Open a state for statewide 2026 and 2024 totals. Open a district for the 2026 candidates, the 2024 presidential vote on these district lines, and the 2024 House race. Where the lines changed, the 2024 House figure is the old district with the same number. Senate and governor views are statewide and use the 2024 presidential vote in the state as the comparison.

Results are unofficial until each state certifies them. A few House races were still uncalled when the snapshot was built, and Louisiana’s remaining House runoffs are December 12, 2026.

## Run

```bash
npm install
npm run data
npm run dev
```

`npm run data` downloads the sources and writes `src/lib/data`. Downloaded files are cached in `data/raw`. Run `npm run data -- --fresh` to fetch them again.

## Sources

- 2026 results: [Polling Desk](https://polling-desk.com/press), using civicAPI
- 2024 House and Senate: MIT Election Data and Science Lab, via [electiondata.dev](https://electiondata.dev) (CC0)
- 2024 president, statewide: MIT Election Data and Science Lab, [U.S. President 1976–2024](https://doi.org/10.7910/DVN/42MVDX) (CC0)
- 2024 president by the districts used in 2026: [The Downballot](https://www.the-downballot.com/p/the-downballot-releases-presidential)
- District lines: U.S. Census Bureau TIGERweb 120th Congressional Districts, via [watch.vote](https://watch.vote/docs/api-reference/elections)
- State lines: U.S. Census Bureau cartographic boundaries, via [us-atlas](https://github.com/topojson/us-atlas)
