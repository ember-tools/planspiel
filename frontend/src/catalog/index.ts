import {baseType} from './base-types'
import {squadFunction} from './functions'
import type {BaseType, FleetVehicle, RegionalType, SquadTemplate} from './model'
import {REGIONS, region} from './regions'

export {BASE_TYPES, baseType} from './base-types'
export {SQUAD_FUNCTIONS, squadFunction} from './functions'
export {DEFAULT_REGION, REGIONS, region} from './regions'
export type * from './model'

/**
 * The type a region uses for each base type when a vehicle of another region's type is shown
 * there. A base type missing here falls back to the region's first type with that base.
 */
const PREFERRED: Record<string, Record<string, string>> = {
    BE: {
        'engine-group': 'LHF 20/12',
        'engine-squad': 'LHF',
        'tanker': 'TLF 4000',
        'aerial': 'DLK 23-12',
        'rescue': 'RW 3',
        'command-1': 'ELW 1',
        'command-car': 'ELW 1 C',
        'transport': 'MTF 1',
        'equipment': 'GW RettMat',
        'roll-off-container': 'AB Rüstmaterial',
        'trailer': 'FwA TS',
        'boat': 'MZB',
        'truck': 'LKW 1',
        'ambulance': 'RTW',
        'intensive-care': 'ITW',
    },
    '*': {
        'engine-group': 'HLF 20',
        'engine-squad': 'MLF',
        'engine-reduced': 'VLF',
        'tanker': 'TLF 3000',
        'aerial': 'DLA(K) 23-12',
        'rescue': 'RW',
        'command-car': 'KdoW',
        'transport': 'MTF',
        'equipment': 'GW-L2',
        'roll-off-container': 'AB-Rüst',
        'trailer': 'TSA',
        'boat': 'MZB',
        'intensive-care': 'ITW',
    },
}

const ALL_TYPES = new Map(REGIONS.flatMap(entry => entry.types).map(type => [type.id, type]))

/** The regional type with an id, from any region, or undefined when no region has it. */
export function findType(id: string): RegionalType | undefined {
    return ALL_TYPES.get(id)
}

/** The base type behind a regional type id. */
export function baseOf(typeId: string): BaseType {
    return baseType(findType(typeId)?.base ?? '')
}

/**
 * The type a vehicle shows in a region: its own type when the region has it, otherwise the
 * region's preferred type for the same base, otherwise its own type. The stored type never
 * changes, so switching the region back restores every name.
 */
export function typeInRegion(typeId: string, regionId: string): RegionalType | undefined {
    const own = findType(typeId)
    const target = region(regionId)
    if (!own || target.types.some(type => type.id === typeId)) return own
    const preferred = (PREFERRED[target.id] ?? PREFERRED['*'])[own.base]
    return target.types.find(type => type.base === own.base && type.name === preferred)
        ?? target.types.find(type => type.base === own.base)
        ?? own
}

/** The squads a new vehicle of a type starts with. */
export function defaultSquads(typeId: string): SquadTemplate[] {
    return baseOf(typeId).squads.map(squad => ({...squad}))
}

/** A strength report: leaders, sub-leaders, crew and everyone together. */
export interface Strength {
    leaders: number
    subLeaders: number
    crew: number
    total: number
}

/** Adds up the people of some squads by their rank. */
export function strength(squads: SquadTemplate[]): Strength {
    const report = {leaders: 0, subLeaders: 0, crew: 0, total: 0}
    for (const squad of squads) {
        const rank = squadFunction(squad.function).rank
        if (rank === 'leader') report.leaders += squad.strength
        else if (rank === 'subLeader') report.subLeaders += squad.strength
        else report.crew += squad.strength
        report.total += squad.strength
    }
    return report
}

/** A strength report as it is spoken on the radio, e.g. `0/1/8/9`. */
export function formatStrength(report: Strength): string {
    return `${report.leaders}/${report.subLeaders}/${report.crew}/${report.total}`
}

const GROUPING_PREFIXES = new Set(['AB', 'GW', 'FwA', 'ELW', 'MTF', 'LKW', 'WLF', 'CBRN', 'RTW', 'ITW', 'NEF'])

/**
 * The text inside a vehicle symbol: the first word of the type name, and for names that only
 * say what they are with their second word (`GW SAN`, `ELW 1`, `AB Atemschutz`) that one too.
 */
export function symbolText(typeName: string): string {
    const [first = '', second] = typeName.split(/\s+/)
    if (second && GROUPING_PREFIXES.has(first) && second.length <= 6) return `${first} ${second}`
    return first
}

/** Loads the fleet of a region, or nothing for a region without one. */
export async function loadFleet(regionId: string): Promise<FleetVehicle[]> {
    if (regionId !== 'BE') return []
    return (await import('./berlin-fleet.generated')).BERLIN_FLEET
}
