import {reactive, watch, type WatchStopHandle} from 'vue'
import {liveUrl} from '../api/boards'
import {newId} from './document'
import type {Board} from './model'
import {applyOperations, type Operation} from './operations'
import {applyRemote, boardState, onCommit, replaceDocument, showBoard, showSnapshot} from './store'
import {rememberBoard} from './recent'
import {parseBoard} from './validate'

/** How the connection to a shared board stands. */
export type SyncStatus = 'connecting' | 'live' | 'offline' | 'missing' | 'deleted'

/** What the page shows about a shared board: the connection, who is there, and following. */
export const syncState = reactive({
    token: '',
    status: 'connecting' as SyncStatus,
    readToken: '',
    editors: 0,
    readers: 0,
    follow: true,
    focus: '',
    pending: 0,
})

/** A batch of this client's own edits the server has not confirmed yet. */
interface PendingBatch {
    id: string
    operations: Operation[]
}

const RETRY_DELAYS = [1000, 2000, 5000, 10000]
const SYNC_SPACING = 2500

/** One message the server sends. */
type ServerMessage =
    | {type: 'state', you: string, readOnly: boolean, board: unknown, revision: number, focus: string | null, readToken?: string}
    | {type: 'ops', revision: number, operations: Operation[], batch: string | null, client: string, complete: boolean}
    | {type: 'reject', batch?: string | null, problem: string}
    | {type: 'focus', snapshot: string}
    | {type: 'presence', editors: number, readers: number}
    | {type: 'deleted'}

/**
 * Keeps a shared board in step with the server and everyone else who has it open.
 *
 * Own edits are applied at once and sent as batches; until the server confirms one, it is pending.
 * The server's order is the truth: when someone else's batch arrives, it is applied and the pending
 * own batches are applied again on top, and when an own batch comes back it has its final place.
 * A refused batch, or one the server could only partly apply, makes the client fetch the whole
 * board again. After a lost connection the client reconnects, takes the server's board and sends
 * whatever is still pending.
 */
class BoardSync {
    private socket: WebSocket | null = null
    private me = ''
    private pending: PendingBatch[] = []
    private attempt = 0
    private retry: ReturnType<typeof setTimeout> | undefined
    private closed = false
    private first = true
    private lastSync = 0
    private syncTimer: ReturnType<typeof setTimeout> | undefined
    private readonly stopCommits: () => void
    private readonly stopFocus: WatchStopHandle

    constructor(private readonly token: string) {
        syncState.token = token
        syncState.status = 'connecting'
        syncState.readToken = ''
        this.stopCommits = onCommit(operations => this.send(operations))
        this.stopFocus = watch(() => boardState.snapshotId, snapshot => {
            if (!boardState.readOnly && boardState.shared && snapshot) this.post({type: 'focus', snapshot})
        })
        this.connect()
    }

    /** Ends the connection for good. */
    close(): void {
        this.closed = true
        clearTimeout(this.retry)
        clearTimeout(this.syncTimer)
        this.stopCommits()
        this.stopFocus()
        this.socket?.close()
        this.socket = null
    }

    private connect(): void {
        const socket = new WebSocket(liveUrl(this.token))
        this.socket = socket
        socket.addEventListener('message', event => this.receive(JSON.parse(String(event.data)) as ServerMessage))
        socket.addEventListener('close', event => this.lost(event.code))
    }

    private lost(code: number): void {
        if (this.closed) return
        this.socket = null
        if (code === 4404) {
            syncState.status = 'missing'
            return
        }
        if (syncState.status === 'deleted') return
        syncState.status = 'offline'
        const delay = RETRY_DELAYS[Math.min(this.attempt, RETRY_DELAYS.length - 1)]
        this.attempt += 1
        this.retry = setTimeout(() => this.connect(), delay)
    }

    private send(operations: Operation[]): void {
        if (!boardState.shared || boardState.readOnly) return
        const batch = {id: newId(), operations}
        this.pending.push(batch)
        syncState.pending = this.pending.length
        this.post({type: 'ops', batch: batch.id, operations})
    }

    /** Asks for the whole board, at most once per `SYNC_SPACING`; a later request waits its turn. */
    private requestSync(): void {
        if (this.syncTimer !== undefined) return
        const wait = Math.max(0, this.lastSync + SYNC_SPACING - Date.now())
        this.syncTimer = setTimeout(() => {
            this.syncTimer = undefined
            this.lastSync = Date.now()
            this.post({type: 'sync'})
        }, wait)
    }

    private post(message: object): void {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
    }

    private receive(message: ServerMessage): void {
        switch (message.type) {
            case 'state':
                this.takeState(message)
                return
            case 'ops':
                this.takeOperations(message)
                return
            case 'reject':
                this.pending = this.pending.filter(batch => batch.id !== message.batch)
                syncState.pending = this.pending.length
                this.requestSync()
                return
            case 'focus':
                syncState.focus = message.snapshot
                followFocus()
                return
            case 'presence':
                syncState.editors = message.editors
                syncState.readers = message.readers
                return
            case 'deleted':
                syncState.status = 'deleted'
                this.closed = true
                return
        }
    }

    private takeState(message: Extract<ServerMessage, {type: 'state'}>): void {
        let board: Board
        try {
            board = parseBoard(message.board)
        } catch (error) {
            console.error('The server sent a board this client cannot open', error)
            syncState.status = 'offline'
            return
        }
        this.me = message.you
        this.attempt = 0
        syncState.status = 'live'
        syncState.readToken = message.readToken ?? ''
        rememberBoard(this.token, board.title, !message.readOnly)
        if (this.first) {
            showBoard(board, message.readOnly, true)
            this.first = false
        } else {
            replaceDocument(board, message.readOnly)
        }
        syncState.focus = message.focus ?? ''
        followFocus()
        const resend = this.pending
        this.pending = []
        for (const batch of resend) {
            applyRemote(batch.operations)
            this.send(batch.operations)
        }
        syncState.pending = this.pending.length
    }

    private takeOperations(message: Extract<ServerMessage, {type: 'ops'}>): void {
        if (message.client === this.me) {
            this.pending = this.pending.filter(batch => batch.id !== message.batch)
            syncState.pending = this.pending.length
            applyRemote(message.operations)
            this.reapplyPending()
            if (!message.complete) this.requestSync()
            return
        }
        applyRemote(message.operations)
        this.reapplyPending()
    }

    /** Puts the own unconfirmed batches back on top of what the server has confirmed so far. */
    private reapplyPending(): void {
        const board = boardState.board
        if (!board) return
        for (const batch of this.pending) applyOperations(board as unknown as Record<string, unknown>, batch.operations)
    }
}

/** Shows the snapshot the editors last showed, when this viewer only reads and follows them. */
export function followFocus(): void {
    if (boardState.readOnly && syncState.follow && boardState.board?.snapshots[syncState.focus]) {
        showSnapshot(syncState.focus)
    }
}

/** Turns following the editors on or off; turning it on jumps to where they are. */
export function setFollow(follow: boolean): void {
    syncState.follow = follow
    followFocus()
}

let active: BoardSync | null = null

/** Opens a shared board by its token and keeps it live until `closeSharedBoard`. */
export function openSharedBoard(token: string): void {
    if (active && syncState.token === token) return
    active?.close()
    boardState.board = null
    active = new BoardSync(token)
}

/** Closes the shared board's connection, as when leaving its page. */
export function closeSharedBoard(): void {
    active?.close()
    active = null
    syncState.token = ''
}
