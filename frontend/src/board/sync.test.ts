import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createBoard, sortedSnapshots} from './document'
import {updateSnapshot} from './edits'
import type {Board} from './model'
import {set} from './operations'
import {boardState, commit} from './store'
import {closeSharedBoard, openSharedBoard, syncState} from './sync'

/** A stand-in for the browser's WebSocket that records what is sent and lets a test answer. */
class FakeSocket {
    static OPEN = 1
    static last: FakeSocket | null = null
    readyState = FakeSocket.OPEN
    sent: any[] = []
    private listeners: Record<string, ((event: any) => void)[]> = {}

    constructor(readonly url: string) {
        FakeSocket.last = this
    }

    addEventListener(type: string, listener: (event: any) => void): void {
        (this.listeners[type] ??= []).push(listener)
    }

    send(text: string): void {
        this.sent.push(JSON.parse(text))
    }

    close(): void {
        this.readyState = 3
    }

    drop(): void {
        this.readyState = 3
        for (const listener of this.listeners.close ?? []) listener({code: 1006})
    }

    deliver(message: object): void {
        for (const listener of this.listeners.message ?? []) listener({data: JSON.stringify(message)})
    }
}

let board: Board
let snapshotId: string

beforeEach(() => {
    Object.assign(globalThis, {
        WebSocket: FakeSocket,
        window: {location: {protocol: 'https:', host: 'planspiel.example', origin: 'https://planspiel.example'}},
    })
    board = createBoard('Geteilt')
    snapshotId = sortedSnapshots(board)[0]!.id
    openSharedBoard('edit-token')
})

afterEach(() => {
    closeSharedBoard()
    vi.useRealTimers()
})

function socket(): FakeSocket {
    return FakeSocket.last!
}

function welcome(readOnly = false, focus: string | null = null): void {
    socket().deliver({type: 'state', you: 'me', readOnly, board, revision: 0, focus, readToken: readOnly ? undefined : 'read-token'})
}

describe('shared board sync', () => {
    it('connects to the live address of the token and shows the board it is sent', () => {
        expect(socket().url).toBe('wss://planspiel.example/api/boards/edit-token/live')
        welcome()
        expect(boardState.shared).toBe(true)
        expect(boardState.board?.title).toBe('Geteilt')
        expect(syncState.status).toBe('live')
        expect(syncState.readToken).toBe('read-token')
    })

    it('sends own edits as batches and clears them when the server confirms', () => {
        welcome()
        commit([set(['title'], 'Neu')])
        const sent = socket().sent.find(message => message.type === 'ops')
        expect(sent.operations).toEqual([set(['title'], 'Neu')])
        expect(syncState.pending).toBe(1)
        socket().deliver({type: 'ops', revision: 1, operations: sent.operations, batch: sent.batch, client: 'me', complete: true})
        expect(syncState.pending).toBe(0)
        expect(boardState.board?.title).toBe('Neu')
    })

    it('applies what others did and keeps own unconfirmed edits on top', () => {
        welcome()
        commit([set(['title'], 'Mein Titel')])
        socket().deliver({type: 'ops', revision: 1, operations: [set(['title'], 'Fremder Titel'), set(['region'], 'HE')],
            batch: 'x', client: 'other', complete: true})
        expect(boardState.board?.title).toBe('Mein Titel')
        expect(boardState.board?.region).toBe('HE')
    })

    it('asks for the whole board again when a batch is refused', () => {
        welcome()
        commit([set(['title'], 'Neu')])
        const sent = socket().sent.find(message => message.type === 'ops')
        vi.useFakeTimers()
        socket().deliver({type: 'reject', batch: sent.batch, problem: 'reference'})
        expect(syncState.pending).toBe(0)
        vi.advanceTimersByTime(0)
        expect(socket().sent.at(-1)).toEqual({type: 'sync'})
        socket().deliver({type: 'reject', problem: 'tooSoon'})
        vi.advanceTimersByTime(1000)
        expect(socket().sent.filter(message => message.type === 'sync')).toHaveLength(1)
        vi.advanceTimersByTime(2000)
        expect(socket().sent.filter(message => message.type === 'sync')).toHaveLength(2)
    })

    it('lets readers follow the snapshot the editors show, unless they turned it off', () => {
        const later = {...board.snapshots[snapshotId]!, id: 'later', time: '2099-01-01T10:00'}
        board.snapshots.later = later
        welcome(true, 'later')
        expect(boardState.readOnly).toBe(true)
        expect(boardState.snapshotId).toBe('later')
        socket().deliver({type: 'focus', snapshot: snapshotId})
        expect(boardState.snapshotId).toBe(snapshotId)
        syncState.follow = false
        socket().deliver({type: 'focus', snapshot: 'later'})
        expect(boardState.snapshotId).toBe(snapshotId)
        syncState.follow = true
    })

    it('keeps later own edits on top when an earlier one is confirmed', () => {
        welcome()
        commit([set(['title'], 'a')])
        commit([set(['title'], 'b')])
        const [first] = socket().sent.filter(message => message.type === 'ops')
        socket().deliver({type: 'ops', revision: 1, operations: first.operations, batch: first.batch, client: 'me', complete: true})
        expect(boardState.board?.title).toBe('b')
        expect(syncState.pending).toBe(1)
    })

    it('reconnects after a lost connection, takes the server board and resends what is pending', () => {
        vi.useFakeTimers()
        welcome()
        const earlier = socket()
        earlier.drop()
        expect(syncState.status).toBe('offline')
        commit([set(['region'], 'HE')])
        expect(syncState.pending).toBe(1)
        vi.advanceTimersByTime(1000)
        expect(socket()).not.toBe(earlier)
        socket().deliver({type: 'state', you: 'me-again', readOnly: false, board: {...board, title: 'Vom Server'}, revision: 3, focus: null})
        expect(syncState.status).toBe('live')
        expect(boardState.board?.title).toBe('Vom Server')
        expect(boardState.board?.region).toBe('HE')
        expect(boardState.snapshotId).toBe(snapshotId)
        expect(socket().sent.filter(message => message.type === 'ops').map(message => message.operations)).toEqual([[set(['region'], 'HE')]])
    })

    it('never sends edits from a read-only board', () => {
        welcome(true)
        commit(updateSnapshot(snapshotId, {title: 'x'}))
        expect(socket().sent.filter(message => message.type === 'ops')).toEqual([])
    })
})
