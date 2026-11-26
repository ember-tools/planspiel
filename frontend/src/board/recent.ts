/** A shared board this browser has opened, to find it again without the link. */
export interface RecentBoard {
    token: string
    title: string
    editable: boolean
    opened: string
}

const RECENT_KEY = 'planspiel.recentBoards'
const RECENT_LIMIT = 20

/** The shared boards this browser opened, the most recent first; nothing when storage is unavailable. */
export function recentBoards(): RecentBoard[] {
    try {
        const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
        return Array.isArray(stored) ? stored.filter(entry => typeof entry?.token === 'string') : []
    } catch {
        return []
    }
}

/** Remembers that this browser opened a shared board, replacing an older entry of the same token. */
export function rememberBoard(token: string, title: string, editable: boolean): void {
    const entry: RecentBoard = {token, title, editable, opened: new Date().toISOString()}
    const list = [entry, ...recentBoards().filter(board => board.token !== token)].slice(0, RECENT_LIMIT)
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list))
    } catch (error) {
        console.warn('The list of recent boards could not be saved in this browser', error)
    }
}

/** Forgets a shared board in this browser's list. */
export function forgetBoard(token: string): void {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentBoards().filter(board => board.token !== token)))
    } catch (error) {
        console.warn('The list of recent boards could not be saved in this browser', error)
    }
}
