import {beforeEach, describe, expect, it} from 'vitest'
import {defaultSquads} from '../catalog'
import {addMinutes, createBoard, sortedSnapshots} from './document'
import {addVehicle, copySnapshot, dismountSquad, placeVehicle, removeSnapshot, updateSnapshot} from './edits'
import type {Board} from './model'
import {applyOperations, type Operation} from './operations'

let board: Board
let firstId: string
let vehicleId: string

function apply(operations: Operation[]): void {
    applyOperations(board as unknown as Record<string, unknown>, operations)
}

beforeEach(() => {
    board = createBoard()
    firstId = sortedSnapshots(board)[0]!.id
    apply(updateSnapshot(firstId, {time: '2026-11-26T10:12', title: 'Eintreffen', report: 'Feuer 2. OG'}))
    const added = addVehicle(board, {type: 'be:LHF', callsign: 'LHF 1100/1', station: ''}, defaultSquads('be:LHF'))
    vehicleId = added.id
    apply(added.operations)
    apply(placeVehicle(board, firstId, vehicleId, [52.5, 13.4]))
    apply(dismountSquad(board, firstId, Object.keys(board.vehicles[vehicleId]!.squads)[2]!))
})

describe('addMinutes', () => {
    it('moves across midnight and month ends', () => {
        expect(addMinutes('2026-11-26T10:12', 5)).toBe('2026-11-26T10:17')
        expect(addMinutes('2026-11-30T23:58', 5)).toBe('2026-12-01T00:03')
        expect(addMinutes('2026-12-01T00:03', -5)).toBe('2026-11-30T23:58')
    })
})

describe('copySnapshot', () => {
    it('copies the situation five minutes later, without title and report', () => {
        const copy = copySnapshot(board, firstId)!
        apply(copy.operations)
        const snapshot = board.snapshots[copy.id]!
        expect(snapshot.time).toBe('2026-11-26T10:17')
        expect(snapshot.title).toBe('')
        expect(snapshot.report).toBe('')
        expect(snapshot.vehicles).toEqual(board.snapshots[firstId]!.vehicles)
        expect(snapshot.squads).toEqual(board.snapshots[firstId]!.squads)
    })

    it('is independent of its source', () => {
        const copy = copySnapshot(board, firstId)!
        apply(copy.operations)
        apply(placeVehicle(board, copy.id, vehicleId, [52.6, 13.5]))
        expect(board.snapshots[firstId]!.vehicles[vehicleId]!.position).toEqual([52.5, 13.4])
    })

    it('sorts by time, whatever the order of creation', () => {
        const later = copySnapshot(board, firstId)!
        apply(later.operations)
        apply(updateSnapshot(later.id, {time: '2026-11-26T09:00'}))
        expect(sortedSnapshots(board).map(snapshot => snapshot.id)).toEqual([later.id, firstId])
    })
})

describe('removeSnapshot', () => {
    it('keeps the last snapshot', () => {
        expect(removeSnapshot(board, firstId)).toEqual([])
        const copy = copySnapshot(board, firstId)!
        apply(copy.operations)
        apply(removeSnapshot(board, firstId))
        expect(Object.keys(board.snapshots)).toEqual([copy.id])
    })
})
