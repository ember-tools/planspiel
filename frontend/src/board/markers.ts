import {baseOf, formatStrength, squadFunction} from '../catalog'
import {SYMBOL_WIDTH, escapeSvg, markSymbol} from '@emberbox/ui'
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

const EARTH_CIRCUMFERENCE = 40_075_016.686
const TILE_SIZE = 256
const VEHICLE_BODY_WIDTH = 100

/**
 * How many pixels one metre covers on a Web Mercator map at a zoom level and latitude, which is
 * what drawing a vehicle to scale needs.
 */
export function pixelsPerMetre(zoom: number, latitude: number): number {
    return TILE_SIZE * 2 ** zoom / (EARTH_CIRCUMFERENCE * Math.cos(latitude * Math.PI / 180))
}

/**
 * How wide a vehicle's symbol is per metre of the vehicle, in pixels: the body of a vehicle symbol
 * takes 100 of the canvas' 120 units, and that body stands for the vehicle's length.
 */
export function vehicleSymbolPerMetre(zoom: number, latitude: number): number {
    return pixelsPerMetre(zoom, latitude) * SYMBOL_WIDTH / VEHICLE_BODY_WIDTH
}

/** The direction a vehicle's front points when the snapshot gives none: east, as the symbol is drawn. */
export const DEFAULT_HEADING = 90

/** How a vehicle symbol is turned on the map: by how many degrees, and whether its front is on the left. */
export interface SymbolTurn {
    rotation: number
    facesLeft: boolean
}

/**
 * How to turn a vehicle symbol for a heading. The symbol never turns more than a quarter round
 * either way, so its writing never stands on its head; a front pointing west of north or south
 * is shown by putting the front mark on the left instead.
 */
export function symbolTurn(heading: number = DEFAULT_HEADING): SymbolTurn {
    return heading <= 180 ? {rotation: heading - 90, facesLeft: false} : {rotation: heading - 270, facesLeft: true}
}

/** What a marker shows: the HTML of its icon and whether it is selected. */
export interface MarkerContent {
    html: string
    selected: boolean
}

function caption(lines: string[]): string {
    return lines.filter(Boolean).map(line => `<span class="board-marker-caption">${escapeSvg(line)}</span>`).join('')
}

/**
 * A marker with a symbol and caption lines. With a length in metres the symbol is drawn to scale,
 * but never smaller than other symbols at the same zoom.
 */
function marker(symbol: string, lines: string[], selected: boolean, length?: number): MarkerContent {
    const classes = ['board-marker', selected ? 'is-selected' : '', length ? 'is-to-scale' : ''].filter(Boolean).join(' ')
    const style = length ? ` style="--board-length: ${length}"` : ''
    return {
        html: `<div class="${classes}"${style}><span class="board-marker-symbol">${symbol}</span>${caption(lines)}</div>`,
        selected,
    }
}

/** The marker of a vehicle: its symbol, its call sign and the strength still aboard. */
export function vehicleMarker(board: Board, snapshotId: string, vehicle: Vehicle, selected: boolean): MarkerContent {
    const {mounted, dismounted} = crewStrength(board, snapshotId, vehicle.id)
    const crew = dismounted.total ? t('board.aboard', {strength: formatStrength(mounted)}) : formatStrength(mounted)
    const crewLine = mounted.total + dismounted.total ? crew : ''
    const front = '<span class="board-marker-front" aria-hidden="true"></span>'
    return marker(vehicleSymbol(vehicle.type, board.region) + front, [vehicle.callsign, crewLine], selected, baseOf(vehicle.type).length)
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
