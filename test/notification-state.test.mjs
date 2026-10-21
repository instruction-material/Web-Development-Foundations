import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { startServer } from "../WDF4-Realtime-Chat-App/local-client/serve.mjs";

const role = process.argv[2] ?? "solution";
if (!["starter", "solution"].includes(role))
    throw new Error("Choose starter or solution");
const root = new URL(
    "../WDF4-Realtime-Chat-App/local-client/",
    import.meta.url,
);
const selected = new URL(role + "/", root);
const { createState, normalizeEvent, applyEvents, visibleEntries } =
    await import(new URL("state.mjs", selected));
const fixture = async (name) =>
    JSON.parse(await readFile(new URL(name + ".json", selected), "utf8"));
const event = {
    id: "e1",
    sequence: 1,
    type: "message",
    text: "  雪の星 <b>text</b>  ",
};

test(role + " creates independent state arrays", () => {
    const a = createState();
    const b = createState();
    a.entries.push(event);
    assert.equal(b.entries.length, 0);
    assert.equal(b.phase, "ready");
});
test(role + " normalizes valid text without mutating input", () => {
    const original = structuredClone(event);
    assert.deepEqual(normalizeEvent(event), {
        ...event,
        text: event.text.trim(),
    });
    assert.deepEqual(event, original);
    assert.equal(
        normalizeEvent({
            ...event,
            id: "x".repeat(32),
            text: "y".repeat(160),
            sequence: 1000000,
        }).text.length,
        160,
    );
});
test(role + " rejects wrong shapes and field boundaries", () => {
    for (const value of [
        null,
        [],
        {},
        { ...event, id: "x".repeat(33) },
        { ...event, type: "other" },
        { ...event, text: " " },
        { ...event, text: 42 },
        { ...event, text: "x".repeat(161) },
        { ...event, sequence: -1 },
        { ...event, sequence: 0.5 },
        { ...event, sequence: 1000001 },
    ])
        assert.equal(normalizeEvent(value), null);
});
test(
    role + " applies fixture events and preserves its input state",
    async () => {
        const state = createState();
        const original = structuredClone(state);
        const next = applyEvents(state, await fixture("events"));
        assert.deepEqual(
            next.entries.map((row) => row.id),
            ["e1", "e2"],
        );
        assert.equal(next.phase, "connected");
        assert.equal(next.duplicates, 1);
        assert.equal(next.rejected, 1);
        assert.deepEqual(state, original);
    },
);
test(
    role + " rejects late/repeated events and bounds history and ID memory",
    async () => {
        const next = applyEvents(createState(), await fixture("out-of-order"));
        assert.deepEqual(
            next.entries.map((row) => row.id),
            ["e2", "e3"],
        );
        assert.equal(next.rejected, 1);
        assert.equal(next.duplicates, 1);
        const history = applyEvents(createState(), await fixture("history"));
        assert.deepEqual(
            history.entries.map((row) => row.id),
            Array.from({ length: 10 }, (_, i) => "e" + (i + 6)),
        );
        let bounded = createState();
        for (let i = 0; i < 150; i++)
            bounded = applyEvents(bounded, [
                {
                    id: "n" + i,
                    sequence: i,
                    type: "status",
                    text: "One update",
                },
            ]);
        assert.equal(bounded.entries.length, 10);
        assert.equal(bounded.seenIds.length, 100);
    },
);
test(
    role +
        " handles empty batches and rejects a wrong-shaped or oversized batch",
    () => {
        assert.equal(applyEvents(createState(), []).phase, "empty");
        for (const value of [null, {}, Array(101).fill(event)])
            assert.throws(() => applyEvents(createState(), value));
    },
);
test(role + " filters views without changing the stored history", () => {
    const state = {
        ...createState(),
        entries: [event, { ...event, id: "e2", type: "status" }],
    };
    assert.equal(visibleEntries({ ...state, view: "messages" }).length, 1);
    assert.equal(visibleEntries({ ...state, view: "status" }).length, 1);
    assert.equal(visibleEntries(state).length, 2);
    assert.equal(state.entries.length, 2);
});
for (const sourceRole of ["starter", "solution"])
    test("serves only loopback " + sourceRole + " lab files", async () => {
        const server = await startServer(
            fileURLToPath(new URL(sourceRole + "/", root)),
            0,
        );
        try {
            assert.equal(server.address().address, "127.0.0.1");
            const url = "http://127.0.0.1:" + server.address().port;
            assert.match(await (await fetch(url)).text(), /src="app.mjs"/);
            assert.deepEqual(
                await (await fetch(url + "/events.json")).json(),
                await fixture("events"),
            );
            assert.ok(
                (await fetch(url + "/state.mjs")).headers
                    .get("content-type")
                    .includes("text/javascript"),
            );
            assert.equal(
                (await fetch(url + "/events.json", { method: "HEAD" })).status,
                200,
            );
            assert.equal(
                (await fetch(url + "/events.json", { method: "POST" })).status,
                405,
            );
            for (const path of [
                "/README.md",
                "/serve.mjs",
                "/../package.json",
                "/%2e%2e%2fpackage.json",
            ])
                assert.equal((await fetch(url + path)).status, 404);
        } finally {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
    });
test(
    "starts the documented native CLI and cleans up its child process",
    { timeout: 10000 },
    async () => {
        const command = [fileURLToPath(new URL("serve.mjs", root)), role, "0"];
        const child = spawn(process.execPath, command, {
            cwd: fileURLToPath(root),
            stdio: ["ignore", "pipe", "pipe"],
        });
        const started = new Date().toISOString();
        let timer;
        let errorText = "";
        child.stderr.on("data", (chunk) => {
            errorText += chunk;
        });
        console.log(
            JSON.stringify({
                event: "child-start",
                parentTask:
                    process.env.NOTIFICATION_PARENT_TASK ??
                    "notification-native-contract",
                cwd: fileURLToPath(root),
                command: [process.execPath, ...command],
                pid: child.pid,
                parentPid: process.pid,
                startedAt: started,
                timeoutMs: 5000,
            }),
        );
        try {
            const record = await new Promise((resolve, reject) => {
                let output = "";
                timer = setTimeout(
                    () => reject(new Error("CLI readiness timeout")),
                    5000,
                );
                child.once("error", reject);
                child.once("exit", (code) =>
                    reject(new Error("CLI stopped: " + code + " " + errorText)),
                );
                child.stdout.on("data", (chunk) => {
                    output += chunk;
                    if (output.includes("\n")) {
                        try {
                            resolve(JSON.parse(output.trim()));
                        } catch (error) {
                            reject(error);
                        }
                    }
                });
            });
            clearTimeout(timer);
            assert.equal(record.host, "127.0.0.1");
            assert.equal(
                (
                    await fetch(
                        "http://127.0.0.1:" + record.port + "/events.json",
                    )
                ).status,
                200,
            );
        } finally {
            clearTimeout(timer);
            const ended =
                child.exitCode === null
                    ? once(child, "exit")
                    : Promise.resolve();
            if (child.exitCode === null) child.kill("SIGTERM");
            const force = setTimeout(() => {
                if (child.exitCode === null) child.kill("SIGKILL");
            }, 1000);
            await ended;
            clearTimeout(force);
            console.log(
                JSON.stringify({
                    event: "child-end",
                    parentTask:
                        process.env.NOTIFICATION_PARENT_TASK ??
                        "notification-native-contract",
                    pid: child.pid,
                    startedAt: started,
                    endedAt: new Date().toISOString(),
                    exitCode: child.exitCode,
                    signal: child.signalCode,
                    cleanup: "terminated and awaited owned child process",
                }),
            );
        }
    },
);
