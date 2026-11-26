import type {MarkKind} from '../symbols/tactical'

/** A point on the map as latitude and longitude. */
export type LatLng = [number, number]

/** A squad of a vehicle: its function and how many people it has. */
export interface Squad {
    id: string
    function: string
    strength: number
    order: number
}

/** A vehicle of the board with its crew. It exists in every snapshot; where it is, is per snapshot. */
export interface Vehicle {
    id: string
    type: string
    callsign: string
    station: string
    order: number
    squads: Record<string, Squad>
}

/** How a drawn line is meant. */
export const LINE_STYLES = ['hose', 'barrier', 'route'] as const

export type LineStyle = typeof LINE_STYLES[number]

/** How a drawn area is meant. */
export const AREA_STYLES = ['danger', 'sector', 'staging'] as const

export type AreaStyle = typeof AREA_STYLES[number]

/** Something drawn on the map besides units. Its geometry and text are per snapshot. */
export type Feature =
    | {id: string, order: number, kind: 'mark', mark: MarkKind}
    | {id: string, order: number, kind: 'line', style: LineStyle}
    | {id: string, order: number, kind: 'area', style: AreaStyle}
    | {id: string, order: number, kind: 'text'}

export type FeatureKind = Feature['kind']

/** Where a vehicle stands in a snapshot. A vehicle missing from a snapshot is not on scene. */
export interface PlacedVehicle {
    position: LatLng
}

/** Where a dismounted squad stands in a snapshot. A squad missing from a snapshot sits in its vehicle. */
export interface DismountedSquad {
    position: LatLng
}

/** A feature as it is drawn in a snapshot. A feature missing from a snapshot does not exist there. */
export interface DrawnFeature {
    points: LatLng[]
    text: string
}

/** The situation at one point in time. */
export interface Snapshot {
    id: string
    /** Local date and time as `YYYY-MM-DDTHH:mm`, which also sorts the snapshots. */
    time: string
    title: string
    report: string
    vehicles: Record<string, PlacedVehicle>
    squads: Record<string, DismountedSquad>
    features: Record<string, DrawnFeature>
}

/** Where the map looks when a board opens. */
export interface MapView {
    center: LatLng
    zoom: number
}

/** A whole board: what lasts across snapshots, and the snapshots. */
export interface Board {
    version: 1
    title: string
    region: string
    view: MapView
    vehicles: Record<string, Vehicle>
    features: Record<string, Feature>
    snapshots: Record<string, Snapshot>
}
