import type {SquadFunction} from './model'

/** The functions a crew is made of. A rank decides where a member counts in the strength report. */
export const SQUAD_FUNCTIONS: SquadFunction[] = [
    {id: 'unit-leader', name: 'Einheitsführer', short: 'EF', rank: 'leader'},
    {id: 'platoon-leader', name: 'Zugführer', short: 'ZF', rank: 'leader'},
    {id: 'group-leader', name: 'Gruppenführer', short: 'GF', rank: 'subLeader'},
    {id: 'vehicle-leader', name: 'Fahrzeugführer', short: 'Fü', rank: 'subLeader'},
    {id: 'emergency-doctor', name: 'Notarzt', short: 'NA', rank: 'subLeader'},
    {id: 'operator', name: 'Maschinist', short: 'Ma', rank: 'crew'},
    {id: 'messenger', name: 'Melder', short: 'Me', rank: 'crew'},
    {id: 'attack', name: 'Angriffstrupp', short: 'A-Tr', rank: 'crew'},
    {id: 'water', name: 'Wassertrupp', short: 'W-Tr', rank: 'crew'},
    {id: 'hose', name: 'Schlauchtrupp', short: 'S-Tr', rank: 'crew'},
    {id: 'squad', name: 'Trupp', short: 'Tr', rank: 'crew'},
    {id: 'command-support', name: 'Führungsassistenz', short: 'FüAss', rank: 'crew'},
    {id: 'paramedic', name: 'Rettungsdienst', short: 'RD', rank: 'crew'},
    {id: 'driver', name: 'Fahrer', short: 'Fa', rank: 'crew'},
    {id: 'crew', name: 'Besatzung', short: 'Bes', rank: 'crew'},
]

const BY_ID = new Map(SQUAD_FUNCTIONS.map(entry => [entry.id, entry]))

/** The function with an id, falling back to a plain squad for an id no longer in the catalogue. */
export function squadFunction(id: string): SquadFunction {
    return BY_ID.get(id) ?? {id, name: id, short: id, rank: 'crew'}
}
