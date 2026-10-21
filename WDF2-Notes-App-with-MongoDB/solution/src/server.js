import { readFile, stat } from "node:fs/promises";
import { createApp } from "./app.js";
import { memoryStore, mongoStore } from "./store.js";

let store, server;
const log = row => console.log(JSON.stringify(row));
async function start() {
    const port = Number(process.env.PORT ?? 3001);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("invalid_port");
    const adapter = process.env.NOTES_ADAPTER ?? "memory";
    if (!["memory", "mongodb"].includes(adapter)) throw new Error("invalid_adapter");
    let snapshot;
    if (process.env.NOTES_SEED_FILE) {
        const filename = process.env.NOTES_SEED_FILE;
        try {
            if ((await stat(filename)).size > 1024 * 1024) throw new Error("invalid_snapshot");
            snapshot = JSON.parse(await readFile(filename, "utf8"));
        } catch { throw new Error("invalid_snapshot"); }
    }
    store = adapter === "memory" ? memoryStore(snapshot) : await mongoStore(process.env.MONGODB_URI, snapshot);
    if (process.env.NOTES_SCENARIO === "unavailable") {
        const unavailable = async () => { throw new Error("unavailable"); };
        store = { ...store, ready: () => false, list: unavailable, read: unavailable,
            create: unavailable, update: unavailable, remove: unavailable };
    } else if (process.env.NOTES_SCENARIO && process.env.NOTES_SCENARIO !== "ok") {
        throw new Error("invalid_scenario");
    }
    server = createApp(store, log).listen(port, "127.0.0.1", () => {
        log({ event: "ready", host: "127.0.0.1", port: server.address().port, adapter });
    });
    server.on("error", () => stop(1));
}
let stopping = false;
async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 3000);
    deadline.unref();
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await store?.close().catch(() => {});
    clearTimeout(deadline);
    process.exitCode = code;
}
process.once("SIGTERM", () => stop());
process.once("SIGINT", () => stop());
start().catch(async error => {
    const known = ["invalid_port", "invalid_adapter", "invalid_snapshot", "invalid_scenario",
        "isolated_local_database_required", "restore_target_not_empty", "note_limit", "stored_data_requires_migration"];
    log({ event: "startup_failed", error: known.includes(error.code ?? error.message) ? (error.code ?? error.message) : "storage_unavailable" });
    await stop(1);
});
