import {beforeEach, describe, expect, it} from 'vitest'
import {defaultSquads, formatStrength} from '../catalog'
import {createBoard, minutesBetween, sortedSnapshots} from './document'
import {
    addFeature, addVehicle, copySnapshot, crewStrength, dismountSquad, eraseFeature, insertSnapshotBefore,
    insertSnapshotBetween, mountSquad, normalHeading, placeVehicle, removeFeature, removeVehicle, setSquads, turnVehicle,
    updateSnapshot, withdrawVehicle,
} from './edits'
import type {Board} from './model'
import {applyOperations, type Operation} from './operations'

let board: Board
let snapshotId: string
let vehicleId: string

function apply(operations: Operation[]): void {
    applyOperations(board as unknown as Record<string, unknown>, operations)
}

function squadIds(): string[] {
    return Object.values(board.vehicles[vehicleId]!.squads).sort((a, b) => a.order - b.order).map(squad => squad.id)
}

beforeEach(() => {
    board = createBoard('Test')
    snapshotId = sortedSnapshots(board)[0]!.id
    const added = addVehicle(board, {type: 'be:LHF', callsign: 'LHF 1100/1', station: 'Mitte'}, defaultSquads('be:LHF'))
    vehicleId = added.id
    apply(added.operations)
})

describe('vehicles', () => {
    it('start off scene with their default crew', () => {
        expect(board.snapshots[snapshotId]!.vehicles[vehicleId]).toBeUndefined()
        expect(formatStrength(crewStrength(board, snapshotId, vehicleId).mounted)).toBe('0/1/5/6')
    })

    it('cannot be placed when the board does not have them', () => {
        expect(placeVehicle(board, snapshotId, 'unknown', [52.5, 13.4])).toEqual([])
        expect(placeVehicle(board, 'unknown', vehicleId, [52.5, 13.4])).toEqual([])
    })

    it('cannot dismount anyone while off scene', () => {
        expect(dismountSquad(board, snapshotId, squadIds()[0]!)).toEqual([])
    })

    it('let squads dismount next to them and mount again', () => {
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        const [leader, , attack] = squadIds()
        apply(dismountSquad(board, snapshotId, attack!))
        const position = board.snapshots[snapshotId]!.squads[attack!]!.position
        expect(Math.abs(position[0] - 52.5) + Math.abs(position[1] - 13.4)).toBeGreaterThan(0)
        expect(Math.abs(position[0] - 52.5)).toBeLessThan(0.001)
        const {mounted, dismounted} = crewStrength(board, snapshotId, vehicleId)
        expect(formatStrength(mounted)).toBe('0/1/3/4')
        expect(formatStrength(dismounted)).toBe('0/0/2/2')
        apply(dismountSquad(board, snapshotId, leader!))
        expect(board.snapshots[snapshotId]!.squads[leader!]!.position).not.toEqual(position)
        apply(mountSquad(snapshotId, attack!))
        expect(board.snapshots[snapshotId]!.squads[attack!]).toBeUndefined()
    })

    it('take their dismounted squads along when withdrawn', () => {
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        apply(dismountSquad(board, snapshotId, squadIds()[2]!))
        apply(withdrawVehicle(board, snapshotId, vehicleId))
        expect(board.snapshots[snapshotId]!.vehicles).toEqual({})
        expect(board.snapshots[snapshotId]!.squads).toEqual({})
    })

    it('leave every snapshot when removed', () => {
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        apply(dismountSquad(board, snapshotId, squadIds()[2]!))
        apply(removeVehicle(board, vehicleId))
        expect(board.vehicles).toEqual({})
        expect(board.snapshots[snapshotId]!.vehicles).toEqual({})
        expect(board.snapshots[snapshotId]!.squads).toEqual({})
    })

    it('keep dismounted squads that survive a crew change and drop the others', () => {
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        const [leader, operator] = squadIds()
        apply(dismountSquad(board, snapshotId, leader!))
        apply(dismountSquad(board, snapshotId, operator!))
        apply(setSquads(board, vehicleId, [{id: leader!, function: 'group-leader', strength: 1}]))
        expect(Object.keys(board.snapshots[snapshotId]!.squads)).toEqual([leader])
        expect(squadIds()).toEqual([leader])
    })
})

describe('features', () => {
    it('can be erased from one snapshot or removed everywhere', () => {
        const {id, operations} = addFeature(board, snapshotId, {kind: 'line', style: 'hose'}, {points: [[1, 2], [3, 4]], text: ''})
        apply(operations)
        expect(board.features[id]).toMatchObject({kind: 'line', style: 'hose', order: 0})
        apply(eraseFeature(snapshotId, id))
        expect(board.snapshots[snapshotId]!.features).toEqual({})
        expect(board.features[id]).toBeDefined()
        apply(removeFeature(board, id))
        expect(board.features).toEqual({})
    })
})

describe('inserted snapshots', () => {
    /** Adds a copy of a snapshot, at a given time, and returns its id. */
    function later(sourceId: string, time: string): string {
        const copy = copySnapshot(board, sourceId)!
        apply(copy.operations)
        apply(updateSnapshot(copy.id, {time}))
        return copy.id
    }

    it('counts the minutes between two times, across midnight', () => {
        expect(minutesBetween('2026-11-26T23:50', '2026-11-27T00:20')).toBe(30)
    })

    it('go in the middle between two snapshots and show what either shows', () => {
        apply(updateSnapshot(snapshotId, {time: '2026-11-26T10:00'}))
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        const [leader, attack] = squadIds()
        apply(dismountSquad(board, snapshotId, attack!))
        const end = later(snapshotId, '2026-11-26T10:25')
        apply(placeVehicle(board, end, vehicleId, [52.6, 13.5]))
        apply(mountSquad(end, attack!))
        apply(dismountSquad(board, end, leader!))
        const fire = addFeature(board, end, {kind: 'mark', mark: 'fire'}, {points: [[52.5, 13.4]], text: ''})
        apply(fire.operations)

        const inserted = insertSnapshotBetween(board, snapshotId, end)!
        apply(inserted.operations)
        const middle = board.snapshots[inserted.id]!
        expect(middle.time).toBe('2026-11-26T10:12')
        expect(middle.title).toBe('')
        expect(middle.report).toBe('')
        expect(middle.vehicles[vehicleId]!.position).toEqual([52.5, 13.4])
        expect(Object.keys(middle.squads).sort()).toEqual([leader, attack].sort())
        expect(middle.features[fire.id]).toBeDefined()
        expect(sortedSnapshots(board).map(snapshot => snapshot.id)).toEqual([snapshotId, inserted.id, end])
    })

    it('never go between two snapshots of the same time or unknown ones', () => {
        apply(updateSnapshot(snapshotId, {time: '2026-11-26T10:00'}))
        const same = later(snapshotId, '2026-11-26T10:00')
        expect(insertSnapshotBetween(board, snapshotId, same)).toBeNull()
        expect(insertSnapshotBetween(board, snapshotId, 'unknown')).toBeNull()
        expect(insertSnapshotBefore(board, 'unknown')).toBeNull()
    })

    it('stay between their neighbours on the night the clocks go back', () => {
        apply(updateSnapshot(snapshotId, {time: '2026-10-25T02:50'}))
        const end = later(snapshotId, '2026-10-25T03:00')
        const inserted = insertSnapshotBetween(board, snapshotId, end)!
        apply(inserted.operations)
        expect(board.snapshots[inserted.id]!.time).toBe('2026-10-25T02:55')
    })

    it('keep a squad from the later snapshot beside its vehicle where the earlier one stands it', () => {
        apply(updateSnapshot(snapshotId, {time: '2026-11-26T10:00'}))
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        const end = later(snapshotId, '2026-11-26T10:20')
        apply(placeVehicle(board, end, vehicleId, [52.6, 13.5]))
        const attack = squadIds()[1]!
        apply(dismountSquad(board, end, attack))
        const offset = board.snapshots[end]!.squads[attack]!.position.map((value, axis) => value - [52.6, 13.5][axis]!)
        const inserted = insertSnapshotBetween(board, snapshotId, end)!
        apply(inserted.operations)
        const squad = board.snapshots[inserted.id]!.squads[attack]!.position
        expect(squad[0]).toBeCloseTo(52.5 + offset[0]!, 9)
        expect(squad[1]).toBeCloseTo(13.4 + offset[1]!, 9)
    })

    it('take a vehicle and its squads from the later snapshot when the earlier one has it withdrawn', () => {
        apply(updateSnapshot(snapshotId, {time: '2026-11-26T10:00'}))
        const end = later(snapshotId, '2026-11-26T10:20')
        apply(placeVehicle(board, end, vehicleId, [52.6, 13.5]))
        const attack = squadIds()[1]!
        apply(dismountSquad(board, end, attack))
        const inserted = insertSnapshotBetween(board, snapshotId, end)!
        apply(inserted.operations)
        expect(board.snapshots[inserted.id]!.vehicles[vehicleId]).toEqual(board.snapshots[end]!.vehicles[vehicleId])
        expect(board.snapshots[inserted.id]!.squads[attack]).toEqual(board.snapshots[end]!.squads[attack])
    })

    it('copy the first snapshot five minutes earlier when inserted before it', () => {
        apply(updateSnapshot(snapshotId, {time: '2026-11-27T00:02'}))
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        const inserted = insertSnapshotBefore(board, snapshotId)!
        apply(inserted.operations)
        expect(board.snapshots[inserted.id]!.time).toBe('2026-11-26T23:57')
        expect(board.snapshots[inserted.id]!.vehicles[vehicleId]).toEqual(board.snapshots[snapshotId]!.vehicles[vehicleId])
        expect(sortedSnapshots(board)[0]!.id).toBe(inserted.id)
    })

    it('do not share placed things with the snapshots they came from', () => {
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        const inserted = insertSnapshotBefore(board, snapshotId)!
        apply(inserted.operations)
        board.snapshots[inserted.id]!.vehicles[vehicleId]!.position[0] = 0
        expect(board.snapshots[snapshotId]!.vehicles[vehicleId]!.position[0]).toBe(52.5)
    })
})

describe('turning vehicles', () => {
    it('keeps the heading when a turned vehicle is moved', () => {
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        apply(turnVehicle(board, snapshotId, vehicleId, 200))
        apply(placeVehicle(board, snapshotId, vehicleId, [52.6, 13.5]))
        expect(board.snapshots[snapshotId]!.vehicles[vehicleId]).toEqual({position: [52.6, 13.5], heading: 200})
    })

    it('brings any direction into 0 up to 360', () => {
        expect(normalHeading(-90)).toBe(270)
        expect(normalHeading(720)).toBe(0)
        expect(normalHeading(-1e-14)).toBe(0)
        apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
        apply(turnVehicle(board, snapshotId, vehicleId, -45))
        expect(board.snapshots[snapshotId]!.vehicles[vehicleId]!.heading).toBe(315)
    })

    it('turns only vehicles on scene', () => {
        expect(turnVehicle(board, snapshotId, vehicleId, 10)).toEqual([])
        expect(turnVehicle(board, snapshotId, 'unknown', 10)).toEqual([])
    })
})
