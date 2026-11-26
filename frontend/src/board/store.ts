import {computed, reactive} from 'vue'
import type {MarkKind} from '../symbols/tactical'
import {createBoard, sortedSnapshots} from './document'
import {parseBoard} from './validate'
import type {AreaStyle, Board, LineStyle, Snapshot} from './model'
import {applyOperations, type Operation} from './operations'

/** What a click on the map does right now. */
export type Tool =
    | {kind: 'select'}
    | {kind: 'place-vehicle', vehicleId: string}
    | {kind: 'place-mark', mark: MarkKind}
    | {kind: 'place-text'}
    | {kind: 'draw-line', style: LineStyle}
    | {kind: 'draw-area', style: AreaStyle}

/** What is selected on the map or in the side panel. */
export type Selection =
    | {kind: 'vehicle', id: string}
    | {kind: 'squad', id: string}
    | {kind: 'feature', id: string}

/** Something that wants to hear of every change made here, such as the sync of a shared board. */
export type CommitListener = (operations: Operation[]) => void

const LOCAL_KEY = 'planspiel.localBoard'
const SAVE_DELAY = 300

/**
 * The board being worked on, the snapshot shown, the tool in hand and the selection. `generation`
 * counts the boards shown, so a view can start over when a different board replaces this one. Every change
 * to the board goes through `commit`, which applies operations and hands them on to whoever
 * listens; the board is never mutated anywhere else.
 */
export const boardState = reactive({
    board: null as Board | null,
    snapshotId: '',
    readOnly: false,
    tool: {kind: 'select'} as Tool,
    selection: null as Selection | null,
    generation: 0,
})

const listeners = new Set<CommitListener>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

/** The snapshot currently shown, falling back to the earliest one. */
export const currentSnapshot = computed<Snapshot | null>(() => {
    const board = boardState.board
    if (!board) return null
    return board.snapshots[boardState.snapshotId] ?? sortedSnapshots(board)[0] ?? null
})

/** Applies operations to the board and tells every listener. Nothing happens on a read-only board. */
export function commit(operations: Operation[]): void {
    const board = boardState.board
    if (!board || boardState.readOnly || !operations.length) return
    applyOperations(board as unknown as Record<string, unknown>, operations)
    for (const listener of listeners) listener(operations)
}

/** Registers a listener for every commit and returns how to remove it again. */
export function onCommit(listener: CommitListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/** Shows a board, starting at its earliest snapshot. */
export function showBoard(board: Board, readOnly = false): void {
    boardState.board = board
    boardState.generation += 1
    boardState.readOnly = readOnly
    boardState.snapshotId = sortedSnapshots(board)[0]?.id ?? ''
    boardState.tool = {kind: 'select'}
    boardState.selection = null
}

/** Switches to another snapshot, keeping the tool but dropping the selection. */
export function showSnapshot(snapshotId: string): void {
    boardState.snapshotId = snapshotId
    boardState.selection = null
}

/** Puts a tool in hand; the selection is dropped unless the tool is plain selecting. */
export function useTool(tool: Tool): void {
    boardState.tool = tool
    if (tool.kind !== 'select') boardState.selection = null
}

/** Selects something, or nothing. */
export function select(selection: Selection | null): void {
    boardState.selection = selection
}

/** Reads the board kept in this browser, or nothing when there is none or it cannot be read. */
function readLocal(): Board | null {
    try {
        const stored = localStorage.getItem(LOCAL_KEY)
        return stored ? parseBoard(JSON.parse(stored)) : null
    } catch {
        return null
    }
}

/** Writes the local board now and forgets any pending write. */
function saveLocalNow(): void {
    clearTimeout(saveTimer)
    saveTimer = undefined
    try {
        if (boardState.board) localStorage.setItem(LOCAL_KEY, JSON.stringify(boardState.board))
    } catch (error) {
        console.warn('The board could not be saved in this browser', error)
    }
}

/** Saves the local board shortly after the last change, so a burst of edits is one write. */
function saveLocalSoon(): void {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveLocalNow, SAVE_DELAY)
}

/** Writes a pending save at once when the page goes away, so the last edits are not lost. */
function flushPendingSave(): void {
    if (saveTimer !== undefined) saveLocalNow()
}

let savingLocally = false

/** Opens the board kept in this browser, creating one when there is none, and keeps it saved there. */
export function openLocalBoard(): void {
    showBoard(readLocal() ?? createBoard())
    if (!savingLocally) {
        savingLocally = true
        onCommit(saveLocalSoon)
        window.addEventListener('pagehide', flushPendingSave)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushPendingSave()
        })
    }
    saveLocalSoon()
}

/** Replaces the local board with another one, such as an imported file or a fresh board. */
export function replaceLocalBoard(board: Board): void {
    showBoard(board)
    saveLocalSoon()
}

const ANIMATE_KEY = 'planspiel.animate'

/** Whether this viewer wants switching snapshots animated: their saved choice, else no reduced motion. */
function animationPreference(): boolean {
    let stored: string | null = null
    try {
        stored = localStorage.getItem(ANIMATE_KEY)
    } catch (error) {
        console.warn('The animation setting could not be read in this browser', error)
    }
    if (stored !== null) return stored === 'true'
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** The viewer's animation choice, read when the board view first needs it. */
export const viewerSettings = reactive({animate: true})

/** Reads the viewer's settings from this browser. */
export function loadViewerSettings(): void {
    viewerSettings.animate = animationPreference()
}

/** Turns the animation between snapshots on or off for this viewer and remembers it in this browser. */
export function setAnimate(animate: boolean): void {
    viewerSettings.animate = animate
    try {
        localStorage.setItem(ANIMATE_KEY, String(animate))
    } catch (error) {
        console.warn('The animation setting could not be saved in this browser', error)
    }
}

/** Shows the snapshot before or after the current one in time order, if there is one. */
export function stepSnapshot(direction: -1 | 1): void {
    const board = boardState.board
    const current = currentSnapshot.value
    if (!board || !current) return
    const ordered = sortedSnapshots(board)
    const next = ordered[ordered.findIndex(snapshot => snapshot.id === current.id) + direction]
    if (next) showSnapshot(next.id)
}
