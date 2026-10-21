const form = document.querySelector("#note-form");
const list = document.querySelector("#notes");
const status = document.querySelector("#status");
const cancel = document.querySelector("#cancel");
const saved = new Map();
let editing = null, busy = false;
function lock(value) {
    busy = value;
    for (const node of document.querySelectorAll("button, input, textarea")) node.disabled = value;
}
async function request(path, options = {}) {
    const response = await fetch(path, { ...options, signal: AbortSignal.timeout(2000) });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "request_failed");
    return data;
}
function reset() {
    editing = null;
    form.reset();
    form.querySelector('[type="submit"]').textContent = "Create note";
    cancel.hidden = true;
}
async function load() {
    const rows = await request("/api/notes");
    saved.clear();
    list.replaceChildren();
    for (const row of rows) {
        saved.set(row.id, row);
        const item = document.createElement("li");
        for (const [tag, text] of [["h3", row.title], ["p", row.body], ["small", JSON.stringify(row.tags)]]) {
            const node = document.createElement(tag);
            node.textContent = text;
            item.append(node);
        }
        for (const action of ["Edit", "Delete"]) {
            const button = document.createElement("button");
            button.type = "button"; button.textContent = action;
            button.dataset.id = row.id; button.dataset.action = action;
            item.append(button);
        }
        list.append(item);
    }
}
async function perform(action) {
    if (busy) return;
    lock(true); status.textContent = "Working...";
    try { await action(); }
    catch (error) { status.textContent = "Request failed: " + (error.name === "TimeoutError" ? "timeout" : error.message); }
    finally { lock(false); }
}
form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    perform(async () => {
        let tags;
        try { tags = JSON.parse(String(data.get("tags") ?? "").trim() || "[]"); }
        catch { throw new Error("invalid_tags_json"); }
        const input = { title: data.get("title"), body: data.get("body"), tags };
        await request(editing ? "/api/notes/" + editing : "/api/notes", {
            method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
        });
        reset(); await load(); status.textContent = "Note saved.";
    });
});
cancel.addEventListener("click", () => { reset(); status.textContent = "Edit cancelled."; });
list.addEventListener("click", event => {
    const button = event.target;
    if (busy || !(button instanceof HTMLButtonElement) || !button.dataset.id) return;
    const row = saved.get(button.dataset.id);
    if (!row) return;
    if (button.dataset.action === "Edit") {
        editing = row.id;
        for (const field of ["title", "body", "tags"]) form.elements.namedItem(field).value = field === "tags" ? JSON.stringify(row.tags) : row[field];
        form.querySelector('[type="submit"]').textContent = "Update note";
        cancel.hidden = false;
        form.elements.namedItem("title").focus();
        status.textContent = "Editing note.";
    } else perform(async () => {
        await request("/api/notes/" + row.id, { method: "DELETE" });
        if (editing === row.id) reset();
        await load(); status.textContent = "Note deleted.";
    });
});
perform(async () => { await load(); status.textContent = "Notes loaded."; });
