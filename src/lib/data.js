import election from './data/election.json'
import statesGeo from './data/states.json'

const districtModules = import.meta.glob('./data/districts/*.json', { eager: true })

const districtsGeo = Object.fromEntries(
  Object.entries(districtModules).map(([file, mod]) => {
    const postal = file.replaceAll('\\', '/').match(/([A-Z]{2})\.json$/)[1]
    return [postal, mod.default]
  }),
)

export function districtsFor(postal) {
  return districtsGeo[postal] ?? { type: 'FeatureCollection', features: [] }
}

export { election, statesGeo }
