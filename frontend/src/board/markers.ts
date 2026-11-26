import {formatStrength, squadFunction} from '../catalog'
import {escapeSvg, markSymbol} from '../symbols/tactical'
import {squadSymbol, vehicleSymbol} from '../symbols/units'
import {t} from '../i18n'
import {crewStrength} from './edits'
import type {Board, Feature, Squad, Vehicle} from './model'

const SYMBOL_AT_ZOOM_17 = 48
const SMALLEST_SYMBOL = 28
const LARGEST_SYMBOL = 80

/**
 * The width of a unit symbol on the map in pixels at a zoom level: 48 at zoom 17, growing by half
 * a factor of two per zoom level in either direction, and never smaller than 28 or larger than 80,
 * so symbols stay readable when zoomed out and do not swallow the street when zoomed in.
 */
export function symbolSize(zoom: number): number {
    const size = Math.round(SYMBOL_AT_ZOOM_17 * 2 ** ((zoom - 17) / 2))
    return Math.min(LARGEST_SYMBOL, Math.max(SMALLEST_SYMBOL, size))
}

/** What a marker shows: the HTML of its icon and whether it is selected. */
export interface MarkerContent {
    html: string
    selected: boolean
}

function caption(lines: string[]): string {
    return lines.filter(Boolean).map(line => `<span class="board-marker-caption">${escapeSvg(line)}</span>`).join('')
}

function marker(symbol: string, lines: string[], selected: boolean): MarkerContent {
    const state = selected ? ' is-selected' : ''
    return {
        html: `<div class="board-marker${state}"><span class="board-marker-symbol">${symbol}</span>${caption(lines)}</div>`,
        selected,
    }
}

/** The marker of a vehicle: its symbol, its call sign and the strength still aboard. */
export function vehicleMarker(board: Board, snapshotId: string, vehicle: Vehicle, selected: boolean): MarkerContent {
    const {mounted, dismounted} = crewStrength(board, snapshotId, vehicle.id)
    const crew = dismounted.total ? t('board.aboard', {strength: formatStrength(mounted)}) : formatStrength(mounted)
    const crewLine = mounted.total + dismounted.total ? crew : ''
    return marker(vehicleSymbol(vehicle.type, board.region), [vehicle.callsign, crewLine], selected)
}

/** The marker of a dismounted squad: its symbol, its strength and the vehicle it belongs to. */
export function squadMarker(vehicle: Vehicle, squad: Squad, selected: boolean): MarkerContent {
    const name = squadFunction(squad.function).short
    return marker(squadSymbol(squad.function), [`${name} (${squad.strength})`, vehicle.callsign], selected)
}

/** The marker of a mark or a text on the map. */
export function featureMarker(feature: Feature, text: string, selected: boolean): MarkerContent {
    if (feature.kind === 'mark') return marker(markSymbol(feature.mark), [text], selected)
    const state = selected ? ' is-selected' : ''
    return {html: `<div class="board-text${state}">${escapeSvg(text || ' ')}</div>`, selected}
}
