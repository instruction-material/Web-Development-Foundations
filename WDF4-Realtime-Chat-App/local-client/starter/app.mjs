import { applyEvents, createState, visibleEntries } from "./state.mjs";

const fixture = document.querySelector("#fixture");
const items = document.querySelector("#items");
const status = document.querySelector("#load-status");
const counts = document.querySelector("#counts");
const empty = document.querySelector("#empty-view");
const loadButton = document.querySelector("#load");
const disconnectButton = document.querySelector("#disconnect");
const reconnectButton = document.querySelector("#reconnect");
let state = createState();
let requestId = 0;
let controller;

function selectedView() {
    const value = window.location.hash.slice(1);
    return ["all", "messages", "status"].includes(value) ? value : "all";
}

function render() {
    const labels = {
        ready: "Ready",
        loading: "Loading notifications…",
        connected: "Loaded",
        empty: "No notifications",
        error: "Could not load this set",
        disconnected: "Disconnected",
        reconnecting: "Reconnecting…",
    };
    status.textContent = labels[state.phase];
    status.dataset.phase = state.phase;
    counts.hidden = !["connected", "empty"].includes(state.phase);
    counts.textContent = `Shown: ${state.entries.length}; duplicate: ${state.duplicates}; rejected: ${state.rejected}`;
    const entries = visibleEntries(state);
    items.replaceChildren();
    for (const entry of entries) {
        const item = document.createElement("li");
        const kind = document.createElement("span");
        const text = document.createElement("p");
        kind.className = "kind";
        kind.textContent = entry.type === "message" ? "Message" : "Status";
        text.textContent = entry.text;
        item.append(kind, text);
        items.appendChild(item);
    }
    empty.hidden = state.phase !== "connected" || entries.length !== 0;
    loadButton.setAttribute(
        "aria-disabled",
        String(["loading", "reconnecting"].includes(state.phase)),
    );
    disconnectButton.setAttribute(
        "aria-disabled",
        String(!["loading", "connected", "reconnecting"].includes(state.phase)),
    );
    reconnectButton.setAttribute(
        "aria-disabled",
        String(!["disconnected", "error"].includes(state.phase)),
    );
    for (const link of document.querySelectorAll("nav a")) {
        if (link.hash === `#${state.view}`)
            link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    }
}

function cancelPending() {
    requestId += 1;
    controller?.abort();
}

async function load(reconnecting = false) {
    cancelPending();
    const current = requestId;
    controller = new AbortController();
    state = {
        ...createState(),
        view: selectedView(),
        phase: reconnecting ? "reconnecting" : "loading",
    };
    render();
    try {
        const response = await fetch(`./${fixture.value}.json`, {
            signal: controller.signal,
            cache: "no-store",
        });
        if (!response.ok) throw new Error("Fixture request failed");
        const data = await response.json();
        if (current !== requestId) return;
        state = applyEvents(state, data);
        render();
    } catch {
        if (current !== requestId) return;
        state = { ...state, phase: "error" };
        render();
    }
}

loadButton.addEventListener("click", () => {
    if (loadButton.getAttribute("aria-disabled") !== "true") load();
});
disconnectButton.addEventListener("click", () => {
    if (disconnectButton.getAttribute("aria-disabled") === "true") return;
    cancelPending();
    state = { ...state, phase: "disconnected" };
    render();
});
reconnectButton.addEventListener("click", () => {
    if (reconnectButton.getAttribute("aria-disabled") !== "true") load(true);
});
document.querySelector("#reset").addEventListener("click", () => {
    cancelPending();
    state = createState();
    window.location.hash = "all";
    render();
});
window.addEventListener("hashchange", () => {
    state = { ...state, view: selectedView() };
    render();
});
window.addEventListener("pagehide", cancelPending);
state.view = selectedView();
render();
