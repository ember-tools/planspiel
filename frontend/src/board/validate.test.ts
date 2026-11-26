import {INCIDENT_MARK_KINDS, WATER_SUPPLY_MARK_KINDS} from '@emberbox/ui'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {beforeEach, describe, expect, it} from 'vitest'
import {defaultSquads} from '../catalog'
import {createBoard, sortedSnapshots} from './document'
import {addFeature, addVehicle, dismountSquad, placeVehicle} from './edits'
import type {Board} from './model'
import {applyOperations, type Operation} from './operations'
import {BoardFormatError, parseBoard, type FormatProblem} from './validate'

let board: Board
let snapshotId: string
let vehicleId: string
let squadId: string
let featureId: string

function apply(operations: Operation[]): void {
    applyOperations(board as unknown as Record<string, unknown>, operations)
}

beforeEach(() => {
    board = createBoard('Test')
    snapshotId = sortedSnapshots(board)[0]!.id
    const vehicle = addVehicle(board, {type: 'be:LHF', callsign: 'LHF 1100/1', station: ''}, defaultSquads('be:LHF'))
    vehicleId = vehicle.id
    apply(vehicle.operations)
    squadId = Object.keys(board.vehicles[vehicleId]!.squads)[0]!
    apply(placeVehicle(board, snapshotId, vehicleId, [52.5, 13.4]))
    apply(dismountSquad(board, snapshotId, squadId))
    const feature = addFeature(board, snapshotId, {kind: 'mark', mark: 'fire'}, {points: [[52.5, 13.4]], text: '2. OG'})
    featureId = feature.id
    apply(feature.operations)
})

/** The problem `parseBoard` reports for a copy of the board changed by `change`. */
function problemAfter(change: (copy: any) => void): FormatProblem | null {
    const copy = JSON.parse(JSON.stringify(board))
    change(copy)
    try {
        parseBoard(copy)
        return null
    } catch (error) {
        if (error instanceof BoardFormatError) return error.problem
        throw error
    }
}

describe('parseBoard', () => {
    it('accepts a complete board after a round trip through JSON', () => {
        expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual(board)
    })

    it('refuses what is not a board at all', () => {
        expect(problemAfter(copy => { copy.version = 2 })).toBe('notABoard')
        expect(() => parseBoard([])).toThrow(BoardFormatError)
    })

    it('refuses fields of the wrong type', () => {
        expect(problemAfter(copy => { copy.vehicles[vehicleId].callsign = 5 })).toBe('field')
        expect(problemAfter(copy => { copy.vehicles[vehicleId].squads[squadId].strength = 'zwei' })).toBe('field')
        expect(problemAfter(copy => { copy.snapshots[snapshotId].features[featureId].text = 7 })).toBe('field')
        expect(problemAfter(copy => { copy.snapshots[snapshotId].report = null })).toBe('field')
        expect(problemAfter(copy => { copy.title = undefined })).toBe('field')
    })

    it('accepts a vehicle heading from 0 up to 360 and nothing else', () => {
        const placed = (copy: any) => copy.snapshots[snapshotId].vehicles[vehicleId]
        expect(problemAfter(copy => { placed(copy).heading = 359.5 })).toBeNull()
        for (const heading of [360, -1, '90', null, Number.NaN]) {
            expect(problemAfter(copy => { placed(copy).heading = heading }), String(heading)).toBe('field')
        }
    })

    it('refuses unknown kinds and styles', () => {
        expect(problemAfter(copy => { copy.features[featureId].mark = 'volcano' })).toBe('field')
        expect(problemAfter(copy => { copy.features[featureId].kind = 'circle' })).toBe('field')
    })

    it('refuses the water supply marks, which boards do not carry', () => {
        for (const mark of WATER_SUPPLY_MARK_KINDS) {
            expect(problemAfter(copy => { copy.features[featureId].mark = mark }), mark).toBe('field')
        }
    })

    it('accepts exactly the marks the server accepts', () => {
        const server = readFileSync(resolve(process.cwd(), '../backend/src/data/board_format.py'), 'utf-8')
        const kinds = /^MARK_KINDS = \((.*)\)$/m.exec(server)![1]!.match(/"[^"]+"/g)!.map(kind => JSON.parse(kind))
        expect(kinds).toEqual([...INCIDENT_MARK_KINDS])
    })

    it('refuses a squad id shared by two vehicles and ids that reach a prototype', () => {
        expect(problemAfter(copy => {
            copy.vehicles.second = {...copy.vehicles[vehicleId], id: 'second'}
        })).toBe('field')
        expect(problemAfter(copy => {
            copy.features = JSON.parse(`{"__proto__": {"id": "__proto__", "order": 0, "kind": "text"}}`)
        })).toBe('field')
    })

    it('refuses entries filed under a key other than their id', () => {
        expect(problemAfter(copy => {
            copy.vehicles.other = copy.vehicles[vehicleId]
            delete copy.vehicles[vehicleId]
        })).toBe('field')
    })

    it('refuses positions that are not coordinates', () => {
        expect(problemAfter(copy => { copy.snapshots[snapshotId].vehicles[vehicleId].position = ['a', 'b'] })).toBe('position')
        expect(problemAfter(copy => { copy.snapshots[snapshotId].squads[squadId].position = [95, 13] })).toBe('position')
        expect(problemAfter(copy => { copy.snapshots[snapshotId].features[featureId].points = [] })).toBe('position')
    })

    it('refuses snapshots that place what the board does not have', () => {
        expect(problemAfter(copy => { copy.snapshots[snapshotId].vehicles.ghost = {position: [52.5, 13.4]} })).toBe('reference')
        expect(problemAfter(copy => { copy.snapshots[snapshotId].features.ghost = {points: [[52.5, 13.4]], text: ''} })).toBe('reference')
    })

    it('refuses a broken time and a board without snapshots', () => {
        expect(problemAfter(copy => { copy.snapshots[snapshotId].time = 'gestern' })).toBe('time')
        expect(problemAfter(copy => { copy.snapshots = {} })).toBe('noSnapshot')
    })
})
