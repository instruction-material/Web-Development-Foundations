import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, cp, symlink, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const pack = path.join(root, "WDF2-Notes-App-with-MongoDB");
const valid = { title: "Orbit", body: "A fictional observation.", tags: ["example"] };
const unknownId = "00000000-0000-4000-8000-999999999999";
const logs = process.env.WDF_PROCESS_LOG;
const activeStops = new Set();
let cancelling = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => {
    if (cancelling) return;
    cancelling = true;
    await Promise.allSettled([...activeStops].map(stop => stop()));
    process.exit(143);
});
async function record(row) {
    if (logs) {
        const { appendFile } = await import("node:fs/promises");
        await appendFile(logs, JSON.stringify({ parentTask: process.env.CLASSES_FAMILY_TASK_ID ?? "wdf2-notes-tests", parentPid: process.pid, ...row }) + "\n");
    }
}
async function child(command, args, cwd, env, ready) {
    const startTime = new Date().toISOString();
    const processChild = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const exited = once(processChild, "exit");
    let stdout = "", stderr = "";
    processChild.stdout.on("data", bytes => { stdout += bytes; });
    processChild.stderr.on("data", bytes => { stderr += bytes; });
    await record({ event: "start", command: [command, ...args], cwd, pid: processChild.pid, startTime, timeoutSeconds: 90, readinessTimeoutSeconds: 20 });
    let stopped;
    const stop = () => stopped ??= (async () => {
        let cleanup = "process already exited";
        if (processChild.exitCode === null && processChild.signalCode === null) {
            cleanup = "owned process group terminated and reaped";
            process.kill(-processChild.pid, "SIGTERM");
            const timer = setTimeout(() => { try { process.kill(-processChild.pid, "SIGKILL"); } catch {} }, 2000);
            try { await exited; } finally { clearTimeout(timer); }
        }
        await record({ event: "end", command: [command, ...args], cwd, pid: processChild.pid, startTime, endTime: new Date().toISOString(), exitCode: processChild.exitCode, signal: processChild.signalCode, timeoutSeconds: 90, readinessTimeoutSeconds: 20, childProcessGroupCleanup: cleanup });
    activeStops.delete(stop);
    })();
    activeStops.add(stop);
    const deadline = Date.now() + 20000;
    try {
        while (Date.now() < deadline) {
            const value = ready(stdout);
            if (value) return { process: processChild, value, stop, output: () => stdout + stderr };
            if (processChild.exitCode !== null || processChild.signalCode !== null) throw new Error("Owned child exited before readiness: " + stdout.slice(-400) + stderr.slice(-400));
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error("Owned child readiness timed out");
    } catch (error) { await stop(); throw error; }
}
const baseEnv = () => {
    const env = { ...process.env, PORT: "0", NOTES_ADAPTER: "memory", NOTES_SCENARIO: "ok" };
    for (const name of ["MONGODB_URI", "NOTES_SEED_FILE"]) delete env[name];
    return env;
};
async function service(directory, extra = {}) {
    const owned = await child(process.execPath, ["src/server.js"], directory, { ...baseEnv(), ...extra }, text => {
        for (const line of text.split("\n")) {
            try { const row = JSON.parse(line); if (row.event === "ready" && row.host === "127.0.0.1" && Number.isInteger(row.port)) return row; } catch {}
        }
    });
    return { ...owned, url: "http://127.0.0.1:" + owned.value.port };
}
async function request(server, endpoint = "/api/notes", { method = "GET", body, raw, headers = {} } = {}) {
    const response = await fetch(server.url + endpoint, { method, signal: AbortSignal.timeout(5000), headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers }, body: body === undefined ? raw : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, type: response.headers.get("content-type"), text, data: text && response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : null };
}
async function completedStarter(directory) {
    await cp(path.join(pack, "starter"), directory, { recursive: true });
    const file = path.join(directory, "src/models/note.js");
    let source = await readFile(file, "utf8");
    const marker = '    // TODO: implement the strict input contract in the README.\n    throw noteError(501, "not_implemented");';
    assert.equal(source.split(marker).length, 2);
    // Independently complete the stated contract using plain JavaScript.
    source = source.replace(marker, `    const invalid = () => { throw noteError(400, "invalid_note"); };
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["title", "body", "tags"].includes(key))) invalid();
    const normalize = (value, maximum) => {
        if (typeof value !== "string") invalid();
        const result = value.trim();
        if (!result || result.length > maximum || !result.isWellFormed()) invalid();
        return result;
    };
    const title = normalize(input.title, 120), body = normalize(input.body, 2000);
    const rawTags = input.tags === undefined ? [] : input.tags;
    if (!Array.isArray(rawTags) || rawTags.length > 8) invalid();
    const tags = rawTags.map(value => normalize(value, 24));
    if (new Set(tags).size !== tags.length) invalid();
    return { title, body, tags };`);
    await writeFile(file, source);
    const store = path.join(directory, "src/store.js");
    let text = await readFile(store, "utf8");
    const missing = '    // TODO: replace one stored record while retaining its identity.\n    throw noteError(501, "not_implemented");';
    assert.equal(text.split(missing).length, 2);
    text = text.replace(missing, `    const old = rows.get(id);
    if (old === undefined) return null;
    for (const row of rows.values()) if (row.id !== id && row.title === input.title) throw noteError(409, "note_conflict");
    const changed = structuredClone({ ...old, ...input, updatedAt: Date.parse(now) < Date.parse(old.updatedAt) ? old.updatedAt : now });
    rows.set(id, changed);
    return structuredClone(changed);`);
    await writeFile(store, text);
}

test("notes input, HTTP CRUD, identity and recovery for both completed roles", { timeout: 90000 }, async t => {
    const temporary = await mkdtemp(path.join(tmpdir(), ".wdf2-notes-"));
    try {
        await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
        for (const role of ["solution", "completed-starter"]) {
            await t.test(role, async t => {
                const directory = role === "solution" ? path.join(pack, role) : path.join(temporary, role);
                if (role !== "solution") await completedStarter(directory);
                const model = await import(pathToFileURL(path.join(directory, "src/models/note.js")));
                const storage = await import(pathToFileURL(path.join(directory, "src/store.js")));
                for (const input of [valid, { title: " 雪の星 ", body: " Fictional ", tags: [" sky "] }, { title: "A", body: "B" }]) {
                    await t.test("accepts " + input.title, () => {
                        const parsed = model.validateNoteInput(input);
                        assert.equal(parsed.title, input.title.trim());
                        assert.deepEqual(parsed.tags, input.tags?.map(value => value.trim()) ?? []);
                    });
                }
                for (const [caseIndex, input] of [null, [], {}, { ...valid, extra: true }, { ...valid, title: 2 }, { ...valid, title: " " }, { ...valid, title: "x".repeat(121) }, { ...valid, body: "x".repeat(2001) }, { ...valid, body: "\ud800" }, { ...valid, tags: "x" }, { ...valid, tags: ["x", " x "] }, { ...valid, tags: Array.from({ length: 9 }, (_, i) => String(i)) }, { ...valid, tags: ["x".repeat(25)] }].entries()) {
                    await t.test("rejects invalid input case " + caseIndex, () => assert.throws(() => model.validateNoteInput(input), error => error.status === 400 && error.code === "invalid_note"));
                }
                await t.test("MongoDB settings admit only the explicitly isolated loopback target", () => {
                    assert.equal(storage.localMongoUri("mongodb://127.0.0.1:27017/wdf2_example"), "mongodb://127.0.0.1:27017/wdf2_example");
                    for (const value of [undefined, "mongodb://example.invalid:27017/wdf2_example", "mongodb://127.0.0.1:27017/other", "mongodb://127.0.0.1/wdf2_example", "mongodb://127.0.0.1:0/wdf2_example", "mongodb://127.0.0.1:65536/wdf2_example", "mongodb://user:password@127.0.0.1:27017/wdf2_example", "mongodb://127.0.0.1:27017/wdf2_example?retryWrites=true"]) assert.throws(() => storage.localMongoUri(value));
                });
                await t.test("snapshot rejects normalization, duplicates and unknown versions before a store is opened", () => {
                    for (const bad of [{ ...storage.seedSnapshot, schemaVersion: 2 }, { ...storage.seedSnapshot, extra: true }, { schemaVersion: 1, notes: [...storage.seedSnapshot.notes, ...storage.seedSnapshot.notes] }, { schemaVersion: 1, notes: [{ ...storage.seedSnapshot.notes[0], title: " Needs trim " }] }, { schemaVersion: 1, notes: [{ ...storage.seedSnapshot.notes[0], tags: undefined }] }, { schemaVersion: 1, notes: [{ ...storage.seedSnapshot.notes[0], updatedAt: "2025-01-01T00:00:00.000Z" }] }]) assert.throws(() => storage.memoryStore(bad), error => error.code === "invalid_snapshot");
                });
                await t.test("replacement preserves valid snapshot time after a clock rollback", async () => {
                    const snapshot = structuredClone(storage.seedSnapshot);
                    snapshot.notes[0].createdAt = "2040-01-01T00:00:00.000Z";
                    snapshot.notes[0].updatedAt = "2040-01-02T00:00:00.000Z";
                    const store = storage.memoryStore(snapshot);
                    const row = await store.update(snapshot.notes[0].id, valid);
                    assert.equal(row.updatedAt, snapshot.notes[0].updatedAt);
                    assert.doesNotThrow(() => model.validateSnapshot({ schemaVersion: 1, notes: [row] }));
                    row.tags.push("outside");
                    assert.deepEqual((await store.read(row.id)).tags, valid.tags);
                });
                let owned, restored;
                try {
                    owned = await service(directory);
                    await t.test("actual CLI serves only public files and JSON routes", async () => {
                        assert.deepEqual((await request(owned, "/health")).data, { ok: true, store: "memory" });
                        for (const url of ["/", "/app.js", "/styles.css"]) assert.equal((await request(owned, url)).status, 200);
                        for (const url of ["/src/server.js", "/package.json", "/.env"]) assert.equal((await request(owned, url)).status, 404);
                        const missing = await request(owned, "/api/missing");
                        assert.equal(missing.status, 404); assert.deepEqual(missing.data, { error: "not_found" });
                        assert.equal((await request(owned, "/api/notes", { method: "PATCH" })).status, 405);
                    });
                    await t.test("malformed, typed and oversized bodies retain stable safe categories", async () => {
                        for (const [options, status, error] of [[{ method: "POST", raw: "{", headers: { "Content-Type": "application/json" } }, 400, "invalid_json"], [{ method: "POST", raw: "{}", headers: { "Content-Type": "text/plain" } }, 415, "json_required"], [{ method: "POST", body: { ...valid, extra: true } }, 400, "invalid_note"], [{ method: "POST", body: { ...valid, body: "x".repeat(17000) } }, 413, "body_too_large"]]) {
                            const response = await request(owned, "/api/notes", options);
                            assert.equal(response.status, status); assert.deepEqual(response.data, { error });
                        }
                        for (const body of [null, 42, "text", [], false]) {
                            const typed = await request(owned, "/api/notes", { method: "POST", body });
                            assert.equal(typed.status, 400); assert.deepEqual(typed.data, { error: "invalid_note" });
                        }
                        assert.equal((await request(owned, "/api/notes/no-id")).status, 400);
                        assert.equal((await request(owned, "/api/notes?unexpected=true")).status, 400);
                    });
                    let created;
                    await t.test("create, read, replacement, exact-title lookup and conflict preserve stable identity", async () => {
                        const response = await request(owned, "/api/notes", { method: "POST", body: valid });
                        assert.equal(response.status, 201); created = response.data;
                        assert.ok(model.idPattern.test(created.id));
                        assert.equal(created.title, "Orbit");
                        assert.deepEqual((await request(owned, "/api/notes/" + created.id)).data, created);
                        assert.deepEqual((await request(owned, "/api/notes?title=Orbit")).data, [created]);
                        const updated = await request(owned, "/api/notes/" + created.id, { method: "PUT", body: { title: "Changed orbit", body: "A revised fictional note." } });
                        assert.equal(updated.status, 200);
                        assert.equal(updated.data.id, created.id); assert.equal(updated.data.createdAt, created.createdAt);
                        assert.ok(updated.data.updatedAt >= created.updatedAt); assert.deepEqual(updated.data.tags, []);
                        const conflict = await request(owned, "/api/notes", { method: "POST", body: { ...valid, title: "Changed orbit" } });
                        assert.equal(conflict.status, 409); assert.deepEqual(conflict.data, { error: "note_conflict" });
                        const missing = await request(owned, "/api/notes/" + unknownId, { method: "PUT", body: valid });
                        assert.equal(missing.status, 404);
                    });
                    await t.test("snapshot restores exact identity to a separate process without changing the source", async () => {
                        const snapshot = (await request(owned, "/api/notes/snapshot")).data;
                        const filename = path.join(temporary, role + "-snapshot.json"); await writeFile(filename, JSON.stringify(snapshot));
                        restored = await service(directory, { NOTES_SEED_FILE: filename });
                        assert.notEqual(restored.value.port, owned.value.port);
                        assert.deepEqual((await request(restored, "/api/notes/snapshot")).data, snapshot);
                        assert.equal((await request(restored, "/api/notes/" + created.id, { method: "DELETE" })).status, 204);
                        assert.equal((await request(owned, "/api/notes/" + created.id)).status, 200);
                        assert.equal((await request(restored, "/api/notes/" + created.id, { method: "DELETE" })).status, 404);
                    });
                    await t.test("memory reset differs from persistence and snapshots", async () => {
                        await owned.stop(); owned = await service(directory);
                        assert.equal((await request(owned, "/api/notes/" + created.id)).status, 404);
                        assert.deepEqual((await request(owned, "/api/notes/snapshot")).data, storage.seedSnapshot);
                    });
                    await t.test("maximum valid snapshot round-trips and the fiftieth record is the limit", async () => {
                        const notes = Array.from({ length: 50 }, (_, i) => ({
                            ...storage.seedSnapshot.notes[0],
                            id: "00000000-0000-4000-8000-" + i.toString(16).padStart(12, "0"),
                            title: "Maximum " + i, body: "\u0000".repeat(2000),
                            tags: Array.from({ length: 8 }, (_, tag) => "tag-" + tag),
                        }));
                        const snapshot = { schemaVersion: 1, notes };
                        const filename = path.join(temporary, role + "-maximum.json");
                        const bytes = JSON.stringify(snapshot);
                        assert.ok(Buffer.byteLength(bytes) > 128 * 1024 && Buffer.byteLength(bytes) < 1024 * 1024);
                        await writeFile(filename, bytes);
                        await owned.stop(); owned = await service(directory, { NOTES_SEED_FILE: filename });
                        assert.deepEqual((await request(owned, "/api/notes/snapshot")).data, snapshot);
                        const result = await request(owned, "/api/notes", { method: "POST", body: valid });
                        assert.equal(result.status, 409); assert.deepEqual(result.data, { error: "note_limit" });
                        assert.equal((await request(owned)).data.length, 50);
                    });
                    await t.test("unavailable adapter is bounded and distinct from healthy process", async () => {
                        await owned.stop(); owned = await service(directory, { NOTES_SCENARIO: "unavailable" });
                        assert.equal((await request(owned, "/health")).status, 200);
                        assert.equal((await request(owned, "/api/ready")).status, 503);
                        const failure = await request(owned); assert.equal(failure.status, 503); assert.deepEqual(failure.data, { error: "storage_unavailable" });
                        assert.ok(!owned.output().includes(valid.body));
                    });
                } finally { await restored?.stop(); await owned?.stop(); }
            });
        }
        await t.test("unfinished starter advertises incomplete mutations", async () => {
            const unfinished = await service(path.join(pack, "starter"));
            try { const result = await request(unfinished, "/api/notes", { method: "POST", body: valid }); assert.equal(result.status, 501); assert.deepEqual(result.data, { error: "not_implemented" }); }
            finally { await unfinished.stop(); }
        });
    } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("MongoDB adapter persists, restores separately, enforces indexes and reports loss", { timeout: 90000, skip: !process.env.WDF_TEST_MONGOD }, async t => {
    const temporary = await mkdtemp(path.join(tmpdir(), "wdf2-mongodb-"));
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    const dbpath = path.join(temporary, "data"); await mkdir(dbpath);
    const mongoArgs = ["--bind_ip", "127.0.0.1", "--port", String(port), "--dbpath", dbpath, "--wiredTigerCacheSizeGB", "0.25", "--nounixsocket", "--quiet"];
    const startMongo = () => child(process.env.WDF_TEST_MONGOD, mongoArgs, temporary, process.env, text => text.split("\n").some(line => {
        try { const value = JSON.parse(line); return value.msg === "Waiting for connections" && value.attr.port === port; } catch { return false; }
    }));
    let mongo, owned, restored;
    try {
        mongo = await startMongo();
        await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
        for (const role of ["solution", "completed-starter"]) {
            await t.test(role, async t => {
                const directory = role === "solution" ? path.join(pack, role) : path.join(temporary, role);
                if (role !== "solution") await completedStarter(directory);
                const prefix = "wdf2_" + randomUUID().replaceAll("-", "");
                const environment = { NOTES_ADAPTER: "mongodb", MONGODB_URI: `mongodb://127.0.0.1:${port}/${prefix}` };
                owned = await service(directory, environment);
                let note;
                await t.test("actual database create and unique-index conflict", async () => {
                    assert.deepEqual((await request(owned, "/health")).data, { ok: true, store: "mongodb" });
                    const response = await request(owned, "/api/notes", { method: "POST", body: valid }); assert.equal(response.status, 201); note = response.data;
                    const conflict = await request(owned, "/api/notes", { method: "POST", body: valid }); assert.equal(conflict.status, 409); assert.deepEqual(conflict.data, { error: "note_conflict" });
                    assert.deepEqual((await request(owned, "/api/notes?title=Orbit")).data, [note]);
                    const update = await request(owned, "/api/notes/" + note.id, { method: "PUT", body: { ...valid, body: "A changed fictional value." } }); assert.equal(update.status, 200); assert.equal(update.data.id, note.id); assert.equal(update.data.createdAt, note.createdAt); note = update.data;
                });
                await t.test("MongoDB replacement preserves a restored future update time", async () => {
                    const snapshot = (await request(owned, "/api/notes/snapshot")).data;
                    for (const row of snapshot.notes) { row.createdAt = "2040-01-01T00:00:00.000Z"; row.updatedAt = "2040-01-02T00:00:00.000Z"; }
                    const filename = path.join(temporary, role + "-future.json"); await writeFile(filename, JSON.stringify(snapshot));
                    const future = await service(directory, { ...environment, MONGODB_URI: environment.MONGODB_URI + "_future", NOTES_SEED_FILE: filename });
                    try {
                        const changed = await request(future, "/api/notes/" + note.id, { method: "PUT", body: valid });
                        assert.equal(changed.status, 200); assert.equal(changed.data.updatedAt, "2040-01-02T00:00:00.000Z");
                        const model = await import(pathToFileURL(path.join(directory, "src/models/note.js")));
                        assert.doesNotThrow(() => model.validateSnapshot({ schemaVersion: 1, notes: [changed.data] }));
                    } finally { await future.stop(); }
                });
                await t.test("legacy stored data is rejected without deleting it", async () => {
                    const { default: mongoose } = await import("mongoose");
                    const legacyUri = environment.MONGODB_URI + "_legacy";
                    const connection = await mongoose.createConnection(legacyUri).asPromise();
                    let original;
                    try {
                        const result = await connection.collection("notes").insertOne({ title: "Legacy fictional note", body: "A retained value.", tags: [], createdAt: new Date(), updatedAt: new Date() });
                        original = result.insertedId;
                    } finally { await connection.close(); }
                    await assert.rejects(service(directory, { ...environment, MONGODB_URI: legacyUri }), /stored_data_requires_migration/);
                    const check = await mongoose.createConnection(legacyUri).asPromise();
                    try { assert.equal(await check.collection("notes").countDocuments(), 1); assert.equal((await check.collection("notes").findOne({ _id: original })).body, "A retained value."); }
                    finally { await check.close(); }
                });
                await t.test("API restart retains exact MongoDB record", async () => { await owned.stop(); owned = await service(directory, environment); assert.deepEqual((await request(owned, "/api/notes/" + note.id)).data, note); });
                await t.test("restore uses a separate empty MongoDB target and refuses overwrite", async () => {
                    const snapshot = (await request(owned, "/api/notes/snapshot")).data;
                    const file = path.join(temporary, role + "-backup.json"); await writeFile(file, JSON.stringify(snapshot));
                    const restoreEnv = { ...environment, MONGODB_URI: environment.MONGODB_URI + "_restore", NOTES_SEED_FILE: file };
                    restored = await service(directory, restoreEnv);
                    assert.deepEqual((await request(restored, "/api/notes/snapshot")).data, snapshot);
                    assert.equal((await request(restored, "/api/notes/" + note.id, { method: "DELETE" })).status, 204);
                    assert.deepEqual((await request(owned, "/api/notes/" + note.id)).data, note);
                    await restored.stop(); restored = undefined;
                    await assert.rejects(service(directory, restoreEnv), /restore_target_not_empty/);
                    assert.deepEqual((await request(owned, "/api/notes/" + note.id)).data, note);
                });
                await t.test("database loss produces bounded safe 503 and recovery preserves records", async () => {
                    await mongo.stop(); mongo = undefined;
                    const started = Date.now(); const failure = await request(owned); assert.equal(failure.status, 503); assert.deepEqual(failure.data, { error: "storage_unavailable" }); assert.ok(Date.now() - started < 5000);
                    assert.equal((await request(owned, "/health")).status, 200);
                    mongo = await startMongo();
                    await owned.stop(); owned = await service(directory, environment);
                    assert.deepEqual((await request(owned, "/api/notes/" + note.id)).data, note);
                });
                await owned.stop(); owned = undefined;
            });
        }
    } finally {
        await restored?.stop(); await owned?.stop(); await mongo?.stop();
        await rm(temporary, { recursive: true, force: true });
    }
});
