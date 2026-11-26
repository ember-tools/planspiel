import type {Organisation, SymbolShape} from '@emberbox/ui'

/** Where a member of a crew stands in a strength report (Führer / Unterführer / Mannschaft). */
export type Rank = 'leader' | 'subLeader' | 'crew'

/** A function within a crew, such as Gruppenführer or Angriffstrupp. */
export interface SquadFunction {
    id: string
    name: string
    short: string
    rank: Rank
}

/** A squad as it is set up on a vehicle: its function and how many people it has. */
export interface SquadTemplate {
    function: string
    strength: number
}

/** The ids of the base types, so a catalogue entry naming an unknown one fails to compile. */
export type BaseTypeId =
    | 'engine-group'
    | 'engine-squad'
    | 'engine-reduced'
    | 'tanker'
    | 'aerial'
    | 'rescue'
    | 'command-1'
    | 'command-post'
    | 'command-car'
    | 'command-car-medical'
    | 'transport'
    | 'hose'
    | 'equipment'
    | 'equipment-medical'
    | 'cbrn-recon'
    | 'swap-body-carrier'
    | 'roll-off-container'
    | 'trailer'
    | 'boat-trailer'
    | 'boat'
    | 'crane'
    | 'truck'
    | 'machine'
    | 'small-vehicle'
    | 'first-responder'
    | 'ambulance'
    | 'emergency-doctor'
    | 'intensive-care'
    | 'patient-transport'
    | 'stroke-unit'

/** The groups a vehicle picker lists types under. */
export type VehicleCategory =
    | 'engine'
    | 'aerial'
    | 'command'
    | 'medical'
    | 'technical'
    | 'hazmat'
    | 'logistics'
    | 'swap-body'
    | 'water'
    | 'other'

/** What a vehicle is, independent of what a federal state calls it. */
export interface BaseType {
    id: BaseTypeId
    name: string
    category: VehicleCategory
    organisation: Organisation
    shape: SymbolShape
    squads: SquadTemplate[]
}

/** A vehicle type under the name one region uses for it. */
export interface RegionalType {
    id: string
    name: string
    longName: string
    base: BaseTypeId
    /** The number that stands for this type in a call sign, where the region has such a scheme. */
    radioCode?: string
    /** The base type whose crew a new vehicle of this type starts with, when it differs from its own base. */
    crew?: BaseTypeId
}

/** A real vehicle of a fleet, to pick instead of typing type and call sign. */
export interface FleetVehicle {
    callsign: string
    type: string
    station: string
    stationNumber: string
    stationKind: 'fire-station' | 'volunteer' | 'technical-service' | 'ambulance-station' | 'other'
    external: boolean
}

/** A federal state, with the vehicle types under the names used there. */
export interface Region {
    id: string
    name: string
    types: RegionalType[]
}
