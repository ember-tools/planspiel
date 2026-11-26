import type {Board} from '../board/model'

/** The tokens of a newly shared board. */
export interface SharedTokens {
    editToken: string
    readToken: string
}

/** Raised when the server refuses a request; `status` is its HTTP status. */
export class BoardRequestError extends Error {
    constructor(readonly status: number) {
        super(`Request failed with status ${status}`)
    }
}

/** Shares a board: stores it on the server and returns the tokens to edit and to read it. */
export async function shareBoard(board: Board): Promise<SharedTokens> {
    const response = await fetch('/api/boards', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(board),
    })
    if (!response.ok) throw new BoardRequestError(response.status)
    return await response.json() as SharedTokens
}

/** Deletes a shared board for good; only its edit token may. */
export async function deleteSharedBoard(token: string): Promise<void> {
    const response = await fetch(`/api/boards/${encodeURIComponent(token)}`, {method: 'DELETE'})
    if (!response.ok) throw new BoardRequestError(response.status)
}

/** The address of a board's live connection, on the same host the page came from. */
export function liveUrl(token: string): string {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${scheme}://${window.location.host}/api/boards/${encodeURIComponent(token)}/live`
}

/** The link that opens a board with a token. */
export function boardLink(token: string): string {
    return `${window.location.origin}/p/${token}`
}
