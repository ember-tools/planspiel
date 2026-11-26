import {DEFAULT_REGION} from '../catalog'
import {DEFAULT_CENTER, DEFAULT_ZOOM} from '../scripts/tiles'
import type {Board, Snapshot} from './model'

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** A random id, unique enough for the entities of one board shared by a handful of people. */
export function newId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    return Array.from(bytes, byte => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')
}

/** The current local time as `YYYY-MM-DDTHH:mm`, the format snapshots are timed in. */
export function localNow(now = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        + `T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * A snapshot time as minutes on a clock that knows no daylight saving: snapshot times are what the
 * wall clock showed, so arithmetic on them is done in UTC, where every day has 24 hours.
 */
function clockMinutes(time: string): number {
    const [date = '', clock = ''] = time.split('T')
    const [year, month, day] = date.split('-').map(Number)
    const [hours, mins] = clock.split(':').map(Number)
    return Date.UTC(year!, month! - 1, day!, hours!, mins!) / 60_000
}

/** Writes minutes on that clock back as a snapshot time. */
function clockTime(minutes: number): string {
    const time = new Date(minutes * 60_000)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${time.getUTCFullYear()}-${pad(time.getUTCMonth() + 1)}-${pad(time.getUTCDate())}`
        + `T${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())}`
}

/** A snapshot time moved by some minutes, across midnight and month ends alike. */
export function addMinutes(time: string, minutes: number): string {
    return clockTime(clockMinutes(time) + minutes)
}

/** The minutes from one snapshot time to another, by the wall clock. */
export function minutesBetween(earlier: string, later: string): number {
    return clockMinutes(later) - clockMinutes(earlier)
}

/** An empty snapshot at a time. */
export function emptySnapshot(time: string): Snapshot {
    return {id: newId(), time, title: '', report: '', vehicles: {}, squads: {}, features: {}}
}

/** A new board with one empty snapshot, so there is always a situation to place units in. */
export function createBoard(title = ''): Board {
    const first = emptySnapshot(localNow())
    return {
        version: 1,
        title,
        region: DEFAULT_REGION,
        view: {center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM},
        vehicles: {},
        features: {},
        snapshots: {[first.id]: first},
    }
}

/** The snapshots of a board in time order; equal times keep their order of creation. */
export function sortedSnapshots(board: Board): Snapshot[] {
    return Object.values(board.snapshots).sort((left, right) => left.time.localeCompare(right.time))
}
