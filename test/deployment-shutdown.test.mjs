import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
for (const role of ["starter", "solution"]) {
    for (const signal of ["SIGINT", "SIGTERM"]) {
        test(`${role}: ${signal} closes an unused browser connection`, { timeout: 8000 }, async () => {
            const file = path.join(repository, "WDF5-Separate-Deployment-Lab", role, "frontend/serve.mjs");
            const command = [process.execPath, file];
            const startedAt = new Date().toISOString();
            const child = spawn(command[0], command.slice(1), {
                cwd: repository, env: { ...process.env, PORT: "0" },
                stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
            });
            const exited = once(child, "exit");
            const kill = value => {
                if (child.exitCode !== null || child.signalCode !== null) return;
                if (process.platform === "win32") child.kill(value);
                else process.kill(-child.pid, value);
            };
            let socket, startupTimer, shutdownTimer;
            const lifetime = setTimeout(() => kill("SIGKILL"), 6500);
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
                        try {
                            const event = JSON.parse(pending.split("\n")[0]);
                            if (event.event === "ready") resolve(event);
                        } catch {}
                    });
                });
                clearTimeout(startupTimer);
                assert.equal(ready.host, "127.0.0.1");
                socket = net.createConnection({ host: ready.host, port: ready.port });
                socket.on("error", () => {});
                await once(socket, "connect");
                await new Promise(resolve => setTimeout(resolve, 60));
                kill(signal);
                const stopped = await Promise.race([
                    exited.then(() => true),
                    new Promise(resolve => { shutdownTimer = setTimeout(() => resolve(false), 1500); }),
                ]);
                assert.equal(stopped, true, "Unused connection prevented graceful shutdown");
                assert.equal(child.exitCode, 0);
                assert.equal(child.signalCode, null);
            } finally {
                clearTimeout(startupTimer); clearTimeout(shutdownTimer); clearTimeout(lifetime);
                socket?.destroy();
                kill("SIGKILL");
                await exited;
                console.log(JSON.stringify({ parentTaskId: process.env.CLASSES_FAMILY_TASK_ID ?? "deployment-shutdown",
                    parentPid: process.pid, cwd: repository, command, pid: child.pid, startedAt,
                    finishedAt: new Date().toISOString(), exitCode: child.exitCode, signal: child.signalCode,
                    timeoutMs: 6500, cleanup: "Owned socket closed and child process group exited and reaped" }));
            }
        });
    }
}
