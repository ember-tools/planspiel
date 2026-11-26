/** Places where keys belong to the control in focus, not to shortcuts of the board. */
const INTERACTIVE = [
    'input', 'textarea', 'select', '[contenteditable="true"]', '[role="dialog"]', '[role="listbox"]',
    '[role="tab"]', '[role="menu"]', '[role="menuitem"]', '[role="combobox"]', '[role="slider"]',
    '[role="radiogroup"]', '[role="switch"]',
].join(', ')

/** Whether a key press happened in a control that uses keys itself. */
export function inControl(event: KeyboardEvent): boolean {
    return event.target instanceof Element && event.target.closest(INTERACTIVE) !== null
}
