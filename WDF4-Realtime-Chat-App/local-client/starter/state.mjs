export const historyLimit = 10;
export const recentIdLimit = 100;

export function createState() {
    return {
        phase: "ready",
        view: "all",
        entries: [],
        seenIds: [],
        lastSequence: -1,
        rejected: 0,
        duplicates: 0,
    };
}

export function visibleEntries(state) {
    return state.view === "messages"
        ? state.entries.filter((entry) => entry.type === "message")
        : state.view === "status"
          ? state.entries.filter((entry) => entry.type === "status")
          : state.entries;
}

export function normalizeEvent(value) {
    // TODO: validate the documented event shape, trim text and return a new event.
    // Return null for invalid input; do not mutate value or read the DOM.
    return null;
}

export function applyEvents(current, incoming) {
    // TODO: validate the batch; copy current; normalize each event.
    // Count invalid, duplicate and out-of-order events without adding them.
    // Retain at most historyLimit entries and recentIdLimit IDs.
    // Return connected/empty according to the retained entries.
    throw new Error("Complete applyEvents in state.mjs.");
}
