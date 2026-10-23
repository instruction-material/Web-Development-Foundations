import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const options = { timeout: 10000, skip: process.platform === "win32" && "Requires catchable POSIX signals" };
async function exercise(role, signal, mode) {
    const file = path.join(repository, "WDF5-Separate-Deployment-Lab", role, "frontend/serve.mjs");
    const command = [process.execPath, path.join(repository, "test/helpers/deployment-server-probe.mjs"), file, mode];
    const startedAt = new Date().toISOString();
    const child = spawn(command[0], command.slice(1), {
        cwd: repository, env: { ...process.env, PORT: "0" },
        stdio: ["ignore", "pipe", "pipe", "ipc"], detached: true,
    });
    const exited = once(child, "exit");
    const messages = [];
    child.on("message", message => messages.push(message));
    async function message(event) {
        if (messages.some(value => value.event === event)) return;
        let timer;
        try {
            await new Promise((resolve, reject) => {
                const receive = value => {
                    if (value.event === event) { child.off("message", receive); resolve(); }
                };
                timer = setTimeout(() => { child.off("message", receive); reject(new Error(`Missing ${event}`)); }, 4000);
                child.on("message", receive);
            });
        } finally { clearTimeout(timer); }
    }
    const kill = value => {
        if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, value);
    };
    let socket, request, startupTimer, shutdownTimer;
    const lifetime = setTimeout(() => kill("SIGKILL"), 8000);
    try {
        const ready = await new Promise((resolve, reject) => {
            let pending = "";
            startupTimer = setTimeout(() => reject(new Error("No server ready event")), 4000);
            child.once("error", reject);
            child.once("exit", () => reject(new Error("Server exited before ready")));
            child.stderr.resume();
            child.stdout.on("data", bytes => {
                pending += bytes;
                if (pending.length > 65536) return reject(new Error("Unbounded server output"));
                if (!pending.includes("\n")) return;
                try { const event = JSON.parse(pending.split("\n")[0]); if (event.event === "ready") resolve(event); } catch {}
            });
        });
        clearTimeout(startupTimer);
        assert.equal(ready.host, "127.0.0.1");
        await message("probeReady");
        if (mode === "unused") {
            socket = net.createConnection({ host: ready.host, port: ready.port });
            socket.on("error", () => {});
            await once(socket, "connect");
            await message("accepted");
        } else {
            const response = new Promise((resolve, reject) => {
                request = http.get({ host: ready.host, port: ready.port, path: "/main.js", agent: false }, incoming => {
                    let body = "";
                    incoming.on("data", bytes => { body += bytes; });
                    incoming.on("error", reject);
                    incoming.on("end", () => resolve({ status: incoming.statusCode, body }));
                });
                request.on("error", reject);
            });
            // Observe rejection immediately even if shutdown resets the socket.
            const observed = response.then(value => ({ value }), error => ({ error }));
            await message("responseReady");
            kill(signal);
            await message("shutdownRequested");
            child.send({ event: "releaseResponse" });
            const result = await observed;
            assert.ifError(result.error);
            assert.equal(result.value.status, 200);
            assert.ok(result.value.body.includes("apiBaseUrl"));
        }
        if (mode === "unused") { kill(signal); await message("shutdownRequested"); }
        const stopped = await Promise.race([
            exited.then(() => true),
            new Promise(resolve => { shutdownTimer = setTimeout(() => resolve(false), 1500); }),
        ]);
        assert.equal(stopped, true, "Unused connection prevented graceful shutdown");
        assert.equal(child.exitCode, 0);
        assert.equal(child.signalCode, null);
    } finally {
        clearTimeout(startupTimer); clearTimeout(shutdownTimer); clearTimeout(lifetime);
        socket?.destroy(); request?.destroy();
        kill("SIGKILL"); await exited;
        console.log(JSON.stringify({ parentTaskId: process.env.CLASSES_FAMILY_TASK_ID ?? "deployment-shutdown",
            parentPid: process.pid, cwd: repository, command, pid: child.pid, startedAt,
            finishedAt: new Date().toISOString(), exitCode: child.exitCode, signal: child.signalCode,
            timeoutMs: 8000, cleanup: "Owned connections closed and child process group exited and reaped" }));
    }
}
for (const role of ["starter", "solution"]) {
    for (const signal of ["SIGINT", "SIGTERM"]) {
        test(`${role}: ${signal} closes an accepted unused connection`, options, () => exercise(role, signal, "unused"));
    }
    test(`${role}: an active asset response drains after SIGTERM`, options, () => exercise(role, "SIGTERM", "drain"));
}
