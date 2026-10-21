import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const cleanups = new Set();
const task = process.env.CLASSES_FAMILY_TASK_ID ?? "wdf4-native-startup";
function log(row) {
    const line =
        JSON.stringify({
            parentTaskId: task,
            parentPid: process.pid,
            time: new Date().toISOString(),
            ...row,
        }) + "\n";
    if (process.env.WDF4_PROCESS_LOG)
        appendFileSync(process.env.WDF4_PROCESS_LOG, line);
    else process.stdout.write(line);
}
async function cleanup() {
    await Promise.allSettled([...cleanups].map((stop) => stop()));
}
after(cleanup);
for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
        await cleanup();
        process.exit(signal === "SIGINT" ? 130 : 143);
    });

async function launch(role, port = "0") {
    const command = [
        process.execPath,
        path.join(root, "WDF4-Realtime-Chat-App", role, "src/server.js"),
    ];
    const child = spawn(command[0], command.slice(1), {
        cwd: root,
        env: { ...process.env, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
    });
    const exited = once(child, "exit");
    exited.catch(() => {});
    const kill = (signal) => {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null)
            return;
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
    };
    const lifetime = setTimeout(() => kill("SIGKILL"), 15000);
    let stopping;
    const stop = () =>
        (stopping ??= (async () => {
            kill("SIGTERM");
            const timer = setTimeout(() => kill("SIGKILL"), 2000);
            try {
                await exited;
            } finally {
                clearTimeout(lifetime);
                clearTimeout(timer);
                cleanups.delete(stop);
                log({
                    event: "end",
                    role,
                    cwd: root,
                    command,
                    pid: child.pid,
                    exitCode: child.exitCode,
                    signal: child.signalCode,
                    cleanup: "owned process group exited and reaped",
                });
            }
        })());
    cleanups.add(stop);
    let deadline;
    let stdout = "",
        stderr = "";
    child.stdout.on("data", (bytes) => {
        stdout += bytes;
    });
    child.stderr.on("data", (bytes) => {
        stderr += bytes;
    });
    try {
        log({
            event: "start",
            role,
            cwd: root,
            command,
            pid: child.pid,
            timeoutMs: 15000,
        });
        if (port === "invalid") {
            await exited;
            assert.equal(child.exitCode, 1);
            assert.match(stderr, /PORT must be an integer/);
            return { stop, invalidPortRejected: true };
        }
        const ready = await new Promise((resolve, reject) => {
            deadline = setTimeout(
                () => reject(new Error("No ready record")),
                5000,
            );
            child.once("error", reject);
            child.once("exit", () =>
                reject(new Error(stderr || "Server exited")),
            );
            child.stdout.on("data", () => {
                for (const line of stdout.split("\n")) {
                    try {
                        const value = JSON.parse(line);
                        if (value.event === "ready") {
                            clearTimeout(deadline);
                            resolve(value);
                        }
                    } catch {}
                }
            });
        });
        assert.equal(ready.host, "127.0.0.1");
        assert.ok(Number.isInteger(ready.port) && ready.port > 0);
        return { url: "http://127.0.0.1:" + ready.port, stop, child };
    } catch (error) {
        await stop();
        throw error;
    } finally {
        clearTimeout(deadline);
    }
}

for (const role of ["starter", "solution"]) {
    test(
        role + " serves its own client and closes the HTTP listener",
        { timeout: 20000 },
        async () => {
            const service = await launch(role);
            try {
                const page = await fetch(service.url, {
                    signal: AbortSignal.timeout(3000),
                });
                assert.equal(page.status, 200);
                const html = await page.text();
                assert.ok(html.includes('src="/socket.io/socket.io.js"'));
                assert.match(
                    html,
                    /<label\s+for="message"\s*>\s*Message\s*<\/label\s*>/,
                );
                assert.ok(!html.includes("cdn.socket.io"));
                const client = await fetch(
                    service.url + "/socket.io/socket.io.js",
                    { signal: AbortSignal.timeout(3000) },
                );
                assert.equal(client.status, 200);
                assert.match(await client.text(), /Socket\.IO v4\./);
                await service.stop();
                assert.equal(service.child.exitCode, 0);
                await assert.rejects(
                    fetch(service.url, { signal: AbortSignal.timeout(1000) }),
                );
            } finally {
                await service.stop();
            }
        },
    );
    test(
        role + " rejects an invalid port before listening",
        { timeout: 20000 },
        async () => {
            const service = await launch(role, "invalid");
            await service.stop();
            assert.equal(service.invalidPortRejected, true);
        },
    );
}
