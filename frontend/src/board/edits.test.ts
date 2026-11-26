import {beforeEach, describe, expect, it} from 'vitest'
import {defaultSquads, formatStrength} from '../catalog'
import {createBoard, sortedSnapshots} from './document'
import {
    addFeature, addVehicle, crewStrength, dismountSquad, eraseFeature, mountSquad, placeVehicle, removeFeature,
    removeVehicle, setSquads, withdrawVehicle,
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
