import {strength, type SquadTemplate, type Strength} from '../catalog'
import {addMinutes, minutesBetween, newId} from './document'
import type {Board, DrawnFeature, Feature, LatLng, Snapshot, Squad, Vehicle} from './model'
import {copyOf, remove, set, type Operation} from './operations'

/** The fields of a vehicle that are edited directly. */
export interface VehicleFields {
    type: string
    callsign: string
    station: string
}

const METRES_PER_DEGREE = 111_320
const DISMOUNT_DISTANCE = 18

/** A point some metres away from another, in a direction given in degrees from north. */
export function offset([lat, lng]: LatLng, metres: number, bearing: number): LatLng {
    const radians = bearing * Math.PI / 180
    const north = Math.cos(radians) * metres / METRES_PER_DEGREE
    const east = Math.sin(radians) * metres / (METRES_PER_DEGREE * Math.cos(lat * Math.PI / 180))
    return [lat + north, lng + east]
}

function nextOrder(entries: Record<string, {order: number}>): number {
    return Math.max(-1, ...Object.values(entries).map(entry => entry.order)) + 1
}

function squadsOf(templates: SquadTemplate[]): Record<string, Squad> {
    return Object.fromEntries(templates.map((template, order) => {
        const id = newId()
        return [id, {id, function: template.function, strength: template.strength, order}]
    }))
}

/** Adds a vehicle with a crew; it is not on scene in any snapshot yet. */
export function addVehicle(board: Board, fields: VehicleFields, crew: SquadTemplate[]): {id: string, operations: Operation[]} {
    const id = newId()
    const vehicle: Vehicle = {id, ...fields, order: nextOrder(board.vehicles), squads: squadsOf(crew)}
    return {id, operations: [set(['vehicles', id], vehicle)]}
}

/** Changes type, call sign or station of a vehicle. */
export function updateVehicle(vehicleId: string, fields: Partial<VehicleFields>): Operation[] {
    return Object.entries(fields).map(([key, value]) => set(['vehicles', vehicleId, key], value))
}

/**
 * Replaces the crew of a vehicle. Squads that keep their id keep their place in every snapshot;
 * squads that are gone leave every snapshot too.
 */
export function setSquads(board: Board, vehicleId: string, squads: Omit<Squad, 'order'>[]): Operation[] {
    const vehicle = board.vehicles[vehicleId]
    if (!vehicle) return []
    const kept = new Set(squads.map(squad => squad.id))
    const record = Object.fromEntries(squads.map((squad, order) => [squad.id, {...squad, order}]))
    const operations = [set(['vehicles', vehicleId, 'squads'], record)]
    for (const squadId of Object.keys(vehicle.squads).filter(id => !kept.has(id))) {
        operations.push(...leaveEverySnapshot(board, 'squads', squadId))
    }
    return operations
}

/** Removes a vehicle with its crew from the board and from every snapshot. */
export function removeVehicle(board: Board, vehicleId: string): Operation[] {
    const vehicle = board.vehicles[vehicleId]
    if (!vehicle) return []
    return [
        remove(['vehicles', vehicleId]),
        ...leaveEverySnapshot(board, 'vehicles', vehicleId),
        ...Object.keys(vehicle.squads).flatMap(squadId => leaveEverySnapshot(board, 'squads', squadId)),
    ]
}

function leaveEverySnapshot(board: Board, key: 'vehicles' | 'squads' | 'features', id: string): Operation[] {
    return Object.values(board.snapshots)
        .filter(snapshot => Object.hasOwn(snapshot[key], id))
        .map(snapshot => remove(['snapshots', snapshot.id, key, id]))
}

/**
 * Puts a vehicle on scene in a snapshot, or moves it there. Its mounted squads go with it. Nothing
 * happens for a vehicle or snapshot the board does not have.
 */
export function placeVehicle(board: Board, snapshotId: string, vehicleId: string, position: LatLng): Operation[] {
    if (!board.vehicles[vehicleId] || !board.snapshots[snapshotId]) return []
    return [set(['snapshots', snapshotId, 'vehicles', vehicleId], {position})]
}

/** Takes a vehicle off scene in a snapshot; its dismounted squads leave with it. */
export function withdrawVehicle(board: Board, snapshotId: string, vehicleId: string): Operation[] {
    const snapshot = board.snapshots[snapshotId]
    const vehicle = board.vehicles[vehicleId]
    if (!snapshot || !vehicle) return []
    return [
        remove(['snapshots', snapshotId, 'vehicles', vehicleId]),
        ...Object.keys(vehicle.squads)
            .filter(squadId => Object.hasOwn(snapshot.squads, squadId))
            .map(squadId => remove(['snapshots', snapshotId, 'squads', squadId])),
    ]
}

/** The vehicle a squad belongs to. */
export function vehicleOfSquad(board: Board, squadId: string): Vehicle | undefined {
    return Object.values(board.vehicles).find(vehicle => Object.hasOwn(vehicle.squads, squadId))
}

/**
 * Lets a squad dismount next to its vehicle, spread around it by its place in the crew so that
 * several squads do not land on one another. A vehicle that is not on scene has nobody to dismount.
 */
export function dismountSquad(board: Board, snapshotId: string, squadId: string): Operation[] {
    const vehicle = vehicleOfSquad(board, squadId)
    const placed = vehicle && board.snapshots[snapshotId]?.vehicles[vehicle.id]
    if (!vehicle || !placed) return []
    const squad = vehicle.squads[squadId]!
    const bearing = 90 + squad.order * 50
    return [set(['snapshots', snapshotId, 'squads', squadId], {position: offset(placed.position, DISMOUNT_DISTANCE, bearing)})]
}

/** Lets a squad mount its vehicle again. */
export function mountSquad(snapshotId: string, squadId: string): Operation[] {
    return [remove(['snapshots', snapshotId, 'squads', squadId])]
}

/** Moves a dismounted squad. */
export function moveSquad(snapshotId: string, squadId: string, position: LatLng): Operation[] {
    return [set(['snapshots', snapshotId, 'squads', squadId], {position})]
}

/** Strength of a vehicle's crew in a snapshot, split into those aboard and those dismounted. */
export function crewStrength(board: Board, snapshotId: string, vehicleId: string): {mounted: Strength, dismounted: Strength} {
    const squads = Object.values(board.vehicles[vehicleId]?.squads ?? {})
    const dismounted = board.snapshots[snapshotId]?.squads ?? {}
    return {
        mounted: strength(squads.filter(squad => !Object.hasOwn(dismounted, squad.id))),
        dismounted: strength(squads.filter(squad => Object.hasOwn(dismounted, squad.id))),
    }
}

/** A feature as it is created: its kind and style, without the id and order the board gives it. */
export type NewFeature =
    | {kind: 'mark', mark: Extract<Feature, {kind: 'mark'}>['mark']}
    | {kind: 'line', style: Extract<Feature, {kind: 'line'}>['style']}
    | {kind: 'area', style: Extract<Feature, {kind: 'area'}>['style']}
    | {kind: 'text'}

/** Adds a feature to the board and draws it in one snapshot. */
export function addFeature(board: Board, snapshotId: string, feature: NewFeature, drawn: DrawnFeature): {id: string, operations: Operation[]} {
    const id = newId()
    return {
        id,
        operations: [
            set(['features', id], {...feature, id, order: nextOrder(board.features)}),
            set(['snapshots', snapshotId, 'features', id], drawn),
        ],
    }
}

/** Redraws a feature in a snapshot, or draws it there for the first time. */
export function drawFeature(snapshotId: string, featureId: string, drawn: DrawnFeature): Operation[] {
    return [set(['snapshots', snapshotId, 'features', featureId], drawn)]
}

/** Removes a feature from one snapshot only; it stays in the others. */
export function eraseFeature(snapshotId: string, featureId: string): Operation[] {
    return [remove(['snapshots', snapshotId, 'features', featureId])]
}

/** Removes a feature from the board and from every snapshot. */
export function removeFeature(board: Board, featureId: string): Operation[] {
    return [remove(['features', featureId]), ...leaveEverySnapshot(board, 'features', featureId)]
}

/** Sets one of the board's own fields: its title, region or map view. */
export function setBoardField<K extends 'title' | 'region' | 'view'>(key: K, value: Board[K]): Operation[] {
    return [set([key], value)]
}

/** The minutes a new snapshot starts after the one it copies. */
export const SNAPSHOT_STEP_MINUTES = 5

/**
 * Adds a snapshot as a copy of another: every vehicle, dismounted squad and drawing stays where it
 * was, the time moves on by a few minutes, title and report start empty.
 */
export function copySnapshot(board: Board, sourceId: string): {id: string, operations: Operation[]} | null {
    const source = board.snapshots[sourceId]
    if (!source) return null
    return newSnapshot(addMinutes(source.time, SNAPSHOT_STEP_MINUTES), source)
}

/** A new, untitled snapshot at a time holding copies of some placed things. */
function newSnapshot(time: string, content: Pick<Snapshot, 'vehicles' | 'squads' | 'features'>): {id: string, operations: Operation[]} {
    const id = newId()
    const placed = copyOf({vehicles: content.vehicles, squads: content.squads, features: content.features})
    const snapshot: Snapshot = {...placed, id, time, title: '', report: ''}
    return {id, operations: [set(['snapshots', id], snapshot)]}
}

/** Whether a snapshot can go between two others: only when their times differ, so it sorts between them. */
export function canInsertBetween(earlier: Snapshot, later: Snapshot): boolean {
    return minutesBetween(earlier.time, later.time) > 0
}

/**
 * The squads of the later snapshot as they go into a snapshot before it: a squad whose vehicle
 * stands elsewhere in the earlier snapshot moves along with it, so it stays beside its vehicle.
 */
function squadsMovedAlong(board: Board, earlier: Snapshot, later: Snapshot): Snapshot['squads'] {
    const moved: Snapshot['squads'] = {}
    for (const [squadId, squad] of Object.entries(later.squads)) {
        const vehicleId = vehicleOfSquad(board, squadId)?.id
        const from = vehicleId ? later.vehicles[vehicleId]?.position : undefined
        const to = vehicleId ? earlier.vehicles[vehicleId]?.position : undefined
        moved[squadId] = from && to
            ? {position: [squad.position[0] + to[0] - from[0], squad.position[1] + to[1] - from[1]]}
            : squad
    }
    return moved
}

/**
 * Inserts a snapshot between two others with different times: in the middle of their times,
 * rounded down to the minute, holding everything either of them shows. What both show stays where
 * the earlier one has it, and a squad dismounted in either is dismounted in the new one, beside
 * its vehicle.
 */
export function insertSnapshotBetween(board: Board, earlierId: string, laterId: string): {id: string, operations: Operation[]} | null {
    const earlier = board.snapshots[earlierId]
    const later = board.snapshots[laterId]
    if (!earlier || !later || !canInsertBetween(earlier, later)) return null
    const gap = minutesBetween(earlier.time, later.time)
    return newSnapshot(addMinutes(earlier.time, Math.floor(gap / 2)), {
        vehicles: {...later.vehicles, ...earlier.vehicles},
        squads: {...squadsMovedAlong(board, earlier, later), ...earlier.squads},
        features: {...later.features, ...earlier.features},
    })
}

/** Inserts a copy of a snapshot five minutes before it, to show what happened earlier. */
export function insertSnapshotBefore(board: Board, sourceId: string): {id: string, operations: Operation[]} | null {
    const source = board.snapshots[sourceId]
    if (!source) return null
    return newSnapshot(addMinutes(source.time, -SNAPSHOT_STEP_MINUTES), source)
}

/** Changes the time, title or report of a snapshot. */
export function updateSnapshot(snapshotId: string, fields: Partial<Pick<Snapshot, 'time' | 'title' | 'report'>>): Operation[] {
    return Object.entries(fields).map(([key, value]) => set(['snapshots', snapshotId, key], value))
}

/** Removes a snapshot; the last one stays, since a board always shows a situation. */
export function removeSnapshot(board: Board, snapshotId: string): Operation[] {
    if (!board.snapshots[snapshotId] || Object.keys(board.snapshots).length < 2) return []
    return [remove(['snapshots', snapshotId])]
}

/**
 * Replaces everything on a shared board with another board, such as an imported file, as one batch
 * that every client applies alike.
 */
export function replaceSharedContent(board: Board): Operation[] {
    return (['title', 'region', 'view', 'vehicles', 'features', 'snapshots'] as const).map(key => set([key], board[key]))
}
