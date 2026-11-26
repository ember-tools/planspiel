import {describe, expect, it} from 'vitest'
import {defaultSquads} from '../catalog'
import {createBoard, sortedSnapshots} from './document'
import {addVehicle} from './edits'
import {applyOperations} from './operations'
import {pixelsPerMetre, symbolSize, vehicleMarker, vehicleSymbolPerMetre} from './markers'

describe('symbolSize', () => {
    it('is 48 pixels at zoom 17 and doubles every two zoom levels', () => {
        expect(symbolSize(17)).toBe(48)
        expect(symbolSize(15)).toBe(28)
        expect(symbolSize(18)).toBe(68)
    })

    it('stays between 28 and 80 pixels', () => {
        expect(symbolSize(10)).toBe(28)
        expect(symbolSize(22)).toBe(80)
    })
})

describe('drawing vehicles to scale', () => {
    it('knows how many pixels a metre covers', () => {
        expect(1 / pixelsPerMetre(0, 0)).toBeCloseTo(156_543, 0)
        expect(1 / pixelsPerMetre(21, 52.52)).toBeCloseTo(0.0454, 3)
    })

    it('makes an engine of 8.5 m about 225 pixels wide at zoom 21 in Berlin', () => {
        expect(8.5 * vehicleSymbolPerMetre(21, 52.52)).toBeCloseTo(224.6, 0)
    })

    it('hands the vehicle length to the marker', () => {
        const board = createBoard('Test')
        const vehicle = addVehicle(board, {type: 'de-he:HLF 20', callsign: 'Florian 1/46', station: ''}, defaultSquads('de-he:HLF 20'))
        applyOperations(board as unknown as Record<string, unknown>, vehicle.operations)
        const html = vehicleMarker(board, sortedSnapshots(board)[0]!.id, board.vehicles[vehicle.id]!, false).html
        expect(html).toContain('class="board-marker is-to-scale" style="--board-length: 8.5"')
    })
})
