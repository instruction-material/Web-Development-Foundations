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
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    if (typeof value.id !== "string" || !/^[a-zA-Z0-9-]{1,32}$/.test(value.id))
        return null;
    if (
        !Number.isInteger(value.sequence) ||
        value.sequence < 0 ||
        value.sequence > 1000000
    )
        return null;
    if (value.type !== "message" && value.type !== "status") return null;
    if (typeof value.text !== "string") return null;
    const text = value.text.trim();
    if (text.length < 1 || text.length > 160) return null;
    return { id: value.id, sequence: value.sequence, type: value.type, text };
}

export function applyEvents(current, incoming) {
    if (!Array.isArray(incoming) || incoming.length > 100)
        throw new Error("Expected at most 100 events.");
    const next = {
        ...current,
        entries: [...current.entries],
        seenIds: [...current.seenIds],
    };
    for (const raw of incoming) {
        const event = normalizeEvent(raw);
        if (!event) {
            next.rejected += 1;
            continue;
        }
        if (next.seenIds.includes(event.id)) {
            next.duplicates += 1;
            continue;
        }
        if (event.sequence <= next.lastSequence) {
            next.rejected += 1;
            continue;
        }
        next.entries = [...next.entries, event].slice(-historyLimit);
        next.seenIds = [...next.seenIds, event.id].slice(-recentIdLimit);
        next.lastSequence = event.sequence;
    }
    next.phase = next.entries.length ? "connected" : "empty";
    return next;
}
