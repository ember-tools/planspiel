import {INCIDENT_MARK_KINDS} from '@emberbox/ui'
import {AREA_STYLES, LINE_STYLES, type Board} from './model'
import {FORBIDDEN_KEYS} from './operations'

/** The reasons a file is refused, each a key below `board.formatErrors` in the translations. */
export type FormatProblem = 'notABoard' | 'field' | 'position' | 'time' | 'noSnapshot' | 'reference'

/** Raised when data is not a board this tool can open; `problem` says why, `where` where. */
export class BoardFormatError extends Error {
    constructor(readonly problem: FormatProblem, readonly where = '') {
        super(`${problem}${where ? ` at ${where}` : ''}`)
    }
}

type Fields = Record<string, unknown>

function isRecord(value: unknown): value is Fields {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, where: string): Fields {
    if (!isRecord(value)) throw new BoardFormatError('field', where)
    return value
}

function text(value: unknown, where: string): void {
    if (typeof value !== 'string') throw new BoardFormatError('field', where)
}

function count(value: unknown, where: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new BoardFormatError('field', where)
}

function oneOf(value: unknown, allowed: readonly string[], where: string): void {
    if (typeof value !== 'string' || !allowed.includes(value)) throw new BoardFormatError('field', where)
}

function latLng(value: unknown, where: string): void {
    const valid = Array.isArray(value) && value.length === 2
        && value.every(number => typeof number === 'number' && Number.isFinite(number))
        && Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180
    if (!valid) throw new BoardFormatError('position', where)
}

/** Checks every entry of a record and that each one carries its own key as id. */
function entries(value: unknown, where: string, check: (entry: Fields, at: string) => void): Fields {
    const checked = record(value, where)
    for (const [key, entry] of Object.entries(checked)) {
        const at = `${where}.${key}`
        const item = record(entry, at)
        if (FORBIDDEN_KEYS.has(key) || item.id !== key) throw new BoardFormatError('field', `${at}.id`)
        check(item, at)
    }
    return checked
}

function checkVehicle(vehicle: Fields, at: string): void {
    text(vehicle.type, `${at}.type`)
    text(vehicle.callsign, `${at}.callsign`)
    text(vehicle.station, `${at}.station`)
    count(vehicle.order, `${at}.order`)
    entries(vehicle.squads, `${at}.squads`, (squad, squadAt) => {
        text(squad.function, `${squadAt}.function`)
        count(squad.strength, `${squadAt}.strength`)
        count(squad.order, `${squadAt}.order`)
    })
}

function checkFeature(feature: Fields, at: string): void {
    count(feature.order, `${at}.order`)
    oneOf(feature.kind, ['mark', 'line', 'area', 'text'], `${at}.kind`)
    if (feature.kind === 'mark') oneOf(feature.mark, INCIDENT_MARK_KINDS, `${at}.mark`)
    if (feature.kind === 'line') oneOf(feature.style, LINE_STYLES, `${at}.style`)
    if (feature.kind === 'area') oneOf(feature.style, AREA_STYLES, `${at}.style`)
}

/** Checks the optional direction of placed vehicles: a number of degrees from 0 up to 360. */
function checkHeadings(value: unknown, where: string): void {
    for (const [id, placed] of Object.entries(record(value, where))) {
        const heading = record(placed, `${where}.${id}`).heading
        if (heading === undefined) continue
        if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0 || heading >= 360) {
            throw new BoardFormatError('field', `${where}.${id}.heading`)
        }
    }
}

function checkPositions(value: unknown, known: Set<string>, where: string): void {
    for (const [id, placed] of Object.entries(record(value, where))) {
        if (!known.has(id)) throw new BoardFormatError('reference', `${where}.${id}`)
        latLng(record(placed, `${where}.${id}`).position, `${where}.${id}.position`)
    }
}

/**
 * Checks that parsed JSON is a complete board and returns it as one: every field the app reads has
 * the right type, every record entry carries its key as id, every snapshot only places vehicles,
 * squads and features the board has, and every position is a real coordinate. A board that passes
 * can be shown and edited without anything failing later.
 */
export function parseBoard(data: unknown): Board {
    if (!isRecord(data) || data.version !== 1) throw new BoardFormatError('notABoard')
    text(data.title, 'title')
    text(data.region, 'region')
    const view = record(data.view, 'view')
    latLng(view.center, 'view.center')
    count(view.zoom, 'view.zoom')
    const vehicles = entries(data.vehicles, 'vehicles', checkVehicle)
    const features = entries(data.features, 'features', checkFeature)
    const vehicleIds = new Set(Object.keys(vehicles))
    const squadList = Object.values(vehicles).flatMap(vehicle => Object.keys((vehicle as Fields).squads as Fields))
    const squadIds = new Set(squadList)
    if (squadIds.size !== squadList.length) throw new BoardFormatError('field', 'squads')
    const featureIds = new Set(Object.keys(features))
    const snapshots = entries(data.snapshots, 'snapshots', (snapshot, at) => {
        if (typeof snapshot.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(snapshot.time)) {
            throw new BoardFormatError('time', `${at}.time`)
        }
        text(snapshot.title, `${at}.title`)
        text(snapshot.report, `${at}.report`)
        checkPositions(snapshot.vehicles, vehicleIds, `${at}.vehicles`)
        checkHeadings(snapshot.vehicles, `${at}.vehicles`)
        checkPositions(snapshot.squads, squadIds, `${at}.squads`)
        for (const [id, drawn] of Object.entries(record(snapshot.features, `${at}.features`))) {
            const where = `${at}.features.${id}`
            if (!featureIds.has(id)) throw new BoardFormatError('reference', where)
            const item = record(drawn, where)
            text(item.text, `${where}.text`)
            if (!Array.isArray(item.points) || !item.points.length) throw new BoardFormatError('position', `${where}.points`)
            item.points.forEach((point, index) => latLng(point, `${where}.points.${index}`))
        }
    })
    if (!Object.keys(snapshots).length) throw new BoardFormatError('noSnapshot')
    return data as unknown as Board
}
