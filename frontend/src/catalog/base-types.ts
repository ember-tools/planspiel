import type {BaseType, BaseTypeId, SquadTemplate} from './model'

const GROUP: SquadTemplate[] = [
    {function: 'group-leader', strength: 1},
    {function: 'operator', strength: 1},
    {function: 'messenger', strength: 1},
    {function: 'attack', strength: 2},
    {function: 'water', strength: 2},
    {function: 'hose', strength: 2},
]

const SQUAD: SquadTemplate[] = [
    {function: 'group-leader', strength: 1},
    {function: 'operator', strength: 1},
    {function: 'attack', strength: 2},
    {function: 'water', strength: 2},
]

const REDUCED: SquadTemplate[] = [
    {function: 'group-leader', strength: 1},
    {function: 'operator', strength: 1},
    {function: 'attack', strength: 2},
]

const VEHICLE_CREW: SquadTemplate[] = [
    {function: 'vehicle-leader', strength: 1},
    {function: 'operator', strength: 1},
    {function: 'squad', strength: 1},
]

const SMALL_CREW: SquadTemplate[] = [
    {function: 'vehicle-leader', strength: 1},
    {function: 'driver', strength: 1},
]

const DRIVER: SquadTemplate[] = [{function: 'driver', strength: 1}]

/**
 * What a vehicle is, whatever a federal state calls it: the form and colour of its symbol and
 * the crew a new vehicle of that kind starts with.
 */
export const BASE_TYPES: BaseType[] = [
    {id: 'engine-group', name: 'Löschfahrzeug (Gruppe)', category: 'engine', organisation: 'fire', shape: 'vehicle', squads: GROUP},
    {id: 'engine-squad', name: 'Löschfahrzeug (Staffel)', category: 'engine', organisation: 'fire', shape: 'vehicle', squads: SQUAD},
    {id: 'engine-reduced', name: 'Löschfahrzeug (vermindert)', category: 'engine', organisation: 'fire', shape: 'vehicle', squads: REDUCED},
    {id: 'tanker', name: 'Tanklöschfahrzeug', category: 'engine', organisation: 'fire', shape: 'vehicle', squads: VEHICLE_CREW},
    {id: 'aerial', name: 'Hubrettungsfahrzeug', category: 'aerial', organisation: 'fire', shape: 'vehicle', squads: VEHICLE_CREW},
    {id: 'rescue', name: 'Rüstwagen', category: 'technical', organisation: 'fire', shape: 'vehicle', squads: VEHICLE_CREW},
    {id: 'command-1', name: 'Einsatzleitwagen 1', category: 'command', organisation: 'fire', shape: 'vehicle', squads: [
        {function: 'platoon-leader', strength: 1},
        {function: 'command-support', strength: 2},
    ]},
    {id: 'command-post', name: 'Einsatzleitwagen 2', category: 'command', organisation: 'fire', shape: 'vehicle', squads: [
        {function: 'unit-leader', strength: 1},
        {function: 'vehicle-leader', strength: 1},
        {function: 'command-support', strength: 4},
    ]},
    {id: 'command-car', name: 'Kommandowagen', category: 'command', organisation: 'fire', shape: 'vehicle', squads: [
        {function: 'platoon-leader', strength: 1},
        {function: 'driver', strength: 1},
    ]},
    {id: 'command-car-medical', name: 'Kommandowagen Rettungsdienst', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: [
        {function: 'emergency-doctor', strength: 1},
        {function: 'driver', strength: 1},
    ]},
    {id: 'transport', name: 'Mannschaftstransportfahrzeug', category: 'logistics', organisation: 'fire', shape: 'vehicle', squads: SMALL_CREW},
    {id: 'hose', name: 'Schlauchwagen', category: 'logistics', organisation: 'fire', shape: 'vehicle', squads: SMALL_CREW},
    {id: 'equipment', name: 'Gerätewagen', category: 'technical', organisation: 'fire', shape: 'vehicle', squads: SMALL_CREW},
    {id: 'equipment-medical', name: 'Gerätewagen Sanität', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: SMALL_CREW},
    {id: 'cbrn-recon', name: 'Mess- und Erkundungsfahrzeug', category: 'hazmat', organisation: 'fire', shape: 'vehicle', squads: [
        {function: 'vehicle-leader', strength: 1},
        {function: 'squad', strength: 2},
        {function: 'driver', strength: 1},
    ]},
    {id: 'swap-body-carrier', name: 'Wechselladerfahrzeug', category: 'swap-body', organisation: 'fire', shape: 'vehicle', squads: DRIVER},
    {id: 'roll-off-container', name: 'Abrollbehälter', category: 'swap-body', organisation: 'fire', shape: 'container', squads: []},
    {id: 'trailer', name: 'Anhänger', category: 'other', organisation: 'fire', shape: 'trailer', squads: []},
    {id: 'boat-trailer', name: 'Anhänger mit Boot', category: 'water', organisation: 'fire', shape: 'trailer', squads: []},
    {id: 'boat', name: 'Boot', category: 'water', organisation: 'fire', shape: 'boat', squads: SMALL_CREW},
    {id: 'crane', name: 'Kranwagen', category: 'technical', organisation: 'fire', shape: 'vehicle', squads: SMALL_CREW},
    {id: 'truck', name: 'Lastkraftwagen', category: 'logistics', organisation: 'fire', shape: 'vehicle', squads: DRIVER},
    {id: 'machine', name: 'Arbeitsmaschine', category: 'technical', organisation: 'fire', shape: 'vehicle', squads: DRIVER},
    {id: 'small-vehicle', name: 'Kleineinsatzfahrzeug', category: 'other', organisation: 'fire', shape: 'vehicle', squads: SMALL_CREW},
    {id: 'first-responder', name: 'Ersthelferfahrzeug', category: 'other', organisation: 'fire', shape: 'vehicle', squads: [
        {function: 'squad', strength: 2},
    ]},
    {id: 'ambulance', name: 'Rettungswagen', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: [
        {function: 'paramedic', strength: 2},
    ]},
    {id: 'emergency-doctor', name: 'Notarzteinsatzfahrzeug', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: [
        {function: 'emergency-doctor', strength: 1},
        {function: 'paramedic', strength: 1},
    ]},
    {id: 'intensive-care', name: 'Intensivtransportwagen', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: [
        {function: 'emergency-doctor', strength: 1},
        {function: 'paramedic', strength: 2},
    ]},
    {id: 'patient-transport', name: 'Krankentransportwagen', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: [
        {function: 'paramedic', strength: 2},
    ]},
    {id: 'stroke-unit', name: 'Stroke-Einsatz-Mobil', category: 'medical', organisation: 'medical', shape: 'vehicle', squads: [
        {function: 'emergency-doctor', strength: 1},
        {function: 'paramedic', strength: 2},
    ]},
]

const BY_ID = new Map(BASE_TYPES.map(base => [base.id, base]))

/** The base type with an id, falling back to a generic vehicle for an unknown id. */
export function baseType(id: string): BaseType {
    return BY_ID.get(id as BaseTypeId) ?? {id: 'equipment', name: id, category: 'other', organisation: 'fire', shape: 'vehicle', squads: []}
}
