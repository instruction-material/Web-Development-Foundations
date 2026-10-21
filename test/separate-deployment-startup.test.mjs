import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

const repository = fileURLToPath(new URL("../", import.meta.url));
const pack = path.join(repository, "WDF5-Separate-Deployment-Lab");
const cleanups = new Set();
const task = process.env.CLASSES_FAMILY_TASK_ID ?? "wdf5-local-startup";
function log(row) {
    const event = { parentTaskId: task, parentPid: process.pid, time: new Date().toISOString(), ...row };
    if (process.env.WDF5_PROCESS_LOG) {
        appendFileSync(process.env.WDF5_PROCESS_LOG, JSON.stringify(event) + "\n");
    } else console.log(JSON.stringify(event));
}
async function cleanupAll() {
    await Promise.allSettled([...cleanups].map(cleanup => cleanup()));
}
after(cleanupAll);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
        await cleanupAll();
        process.exit(signal === "SIGINT" ? 130 : 143);
    });
}
async function start(file, env = {}, cwd = repository) {
    const command = [process.execPath, file];
    const child = spawn(command[0], command.slice(1), {
        cwd, env: { ...process.env, PORT: "0", ...env },
        stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    const exited = once(child, "exit");
    log({ event: "start", cwd, command, pid: child.pid, startupTimeoutMs: 10000, timeoutMs: 60000 });
    const kill = signal => {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
    };
    const lifetime = setTimeout(() => kill("SIGKILL"), 60000);
    let stopPromise;
    const stop = () => stopPromise ??= (async () => {
        kill("SIGTERM");
        const timer = setTimeout(() => kill("SIGKILL"), 1500);
        try { await exited; }
        finally {
            clearTimeout(timer);
            clearTimeout(lifetime);
            cleanups.delete(stop);
            log({ event: "end", cwd, command, pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, cleanup: "owned child process group exited and reaped" });
        }
        assert.equal(child.exitCode, 0, "Owned service did not shut down cleanly");
    })();
    cleanups.add(stop);
    let pending = "";
    let deadline;
    try {
        const ready = await new Promise((resolve, reject) => {
            deadline = setTimeout(() => reject(new Error("No ready event from " + file)), 10000);
            child.once("error", reject);
            child.once("exit", () => reject(new Error("Service exited before ready: " + file)));
            child.stderr.on("data", () => {});
            child.stdout.on("data", bytes => {
                pending += bytes;
                if (pending.length > 65536) return reject(new Error("Unbounded service output"));
                let newline;
                while ((newline = pending.indexOf("\n")) !== -1) {
                    const line = pending.slice(0, newline);
                    pending = pending.slice(newline + 1);
                    try {
                        const event = JSON.parse(line);
                        if (event.event === "ready") resolve(event);
                    } catch {}
                }
            });
        });
        assert.equal(ready.host, "127.0.0.1");
        assert.ok(Number.isInteger(ready.port) && ready.port > 0);
        return { ready, url: `http://127.0.0.1:${ready.port}`, stop };
    } catch (error) {
        await stop();
        throw error;
    } finally { clearTimeout(deadline); }
}
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(2000) });

for (const role of ["starter", "solution"]) {
    test(`${role}: separate local processes, public configuration and recovery`, { timeout: 60000 }, async () => {
        const base = process.env.WDF5_TEST_TMP_ROOT ?? os.tmpdir();
        await mkdir(base, { recursive: true });
        const scratch = await mkdtemp(path.join(base, ".wdf5-local-"));
        const frontendSource = path.join(pack, role, "frontend");
        let frontend, api, browser;
        let closeBrowser;
        try {
            for (const name of ["index.html", "main.js", "serve.mjs", ...(role === "solution" ? ["styles.css"] : [])]) {
                await writeFile(path.join(scratch, name), await readFile(path.join(frontendSource, name)));
            }
            frontend = await start(path.join(scratch, "serve.mjs"), {}, scratch);
            api = await start(path.join(pack, role, "backend/src/server.js"), { FRONTEND_ORIGIN: undefined, REGION: undefined });
            const defaults = await request(api.url + "/api/status", { headers: { Origin: "http://127.0.0.1:4173" } });
            assert.equal(defaults.headers.get("access-control-allow-origin"), "http://127.0.0.1:4173");
            await defaults.arrayBuffer();
            await api.stop();
            api = await start(path.join(pack, role, "backend/src/server.js"), { FRONTEND_ORIGIN: frontend.url, REGION: "local" });
            const originalConfig = await readFile(path.join(frontendSource, role === "starter" ? "env.template.js" : "env.js"), "utf8");
            assert.match(originalConfig, /http:\/\/127\.0\.0\.1:4001/);
            await writeFile(path.join(scratch, "env.js"), `window.__APP_CONFIG__ = ${JSON.stringify({ apiBaseUrl: api.url })};\n`);
            const html = await (await request(frontend.url)).text();
            assert.ok(html.indexOf('src="env.js"') >= 0);
            assert.ok(html.indexOf('src="env.js"') < html.indexOf('src="main.js"'));
            const config = await request(frontend.url + "/env.js");
            assert.match(config.headers.get("content-type"), /javascript/);
            assert.match(await config.text(), new RegExp(api.url.replaceAll(".", "\\.")));
            const result = await request(api.url + "/api/status", { headers: { Origin: frontend.url } });
            assert.equal(result.status, 200);
            assert.equal(result.headers.get("access-control-allow-origin"), frontend.url);
            const payload = await result.json();
            assert.equal(payload.message, role === "starter" ? "Starter API is running." : "Solution API is running.");
            if (role === "solution") assert.equal(payload.region, "local");
            const wrong = await request(api.url + "/api/status", { headers: { Origin: "http://127.0.0.1:1" } });
            assert.notEqual(wrong.headers.get("access-control-allow-origin"), "http://127.0.0.1:1");
            for (const hidden of ["/backend/src/server.js", "/.env", "/.git/config", "/package.json", "/missing"]) {
                assert.equal((await request(frontend.url + hidden)).status, 404);
            }
            const method = await request(frontend.url + "/env.js", { method: "POST" });
            assert.equal(method.status, 405);
            assert.equal(method.headers.get("allow"), "GET, HEAD");
            assert.equal(await (await request(frontend.url, { method: "HEAD" })).text(), "");
            const nativePort = api.ready.port;
            await api.stop();
            await assert.rejects(request(api.url + "/api/status"));
            assert.equal((await request(frontend.url)).status, 200);
            api = await start(path.join(pack, role, "backend/src/server.js"), { PORT: String(nativePort), FRONTEND_ORIGIN: frontend.url, REGION: "local" });
            assert.equal((await request(api.url + "/api/status")).status, 200);
            if (process.env.WDF5_BROWSER_MODULE) {
                const { default: puppeteer } = await import(pathToFileURL(process.env.WDF5_BROWSER_MODULE));
                browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
                const browserProcess = browser.process();
                assert.ok(browserProcess);
                log({ event: "start", kind: "browser", cwd: repository, command: browserProcess.spawnargs, pid: browserProcess.pid, timeoutMs: 60000 });
                let closing;
                closeBrowser = () => closing ??= (async () => {
                    await browser.close();
                    cleanups.delete(closeBrowser);
                    log({ event: "end", kind: "browser", cwd: repository, command: browserProcess.spawnargs, pid: browserProcess.pid, exitCode: browserProcess.exitCode, signal: browserProcess.signalCode, cleanup: "Puppeteer-owned browser closed" });
                })();
                cleanups.add(closeBrowser);
                for (const width of [390, 1280]) {
                    const page = await browser.newPage();
                    try {
                        await page.setViewport({ width, height: 900 });
                        await page.goto(frontend.url, { waitUntil: "networkidle0" });
                        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("API is running."), { timeout: 5000 });
                        assert.equal(await page.$eval("#status", node => node.getAttribute("role")), "status");
                        assert.equal(await page.$eval("#status", node => node.textContent), role === "starter" ? "Starter API is running." : "Solution API is running. Region: local.");
                        if (process.env.WDF5_SCREENSHOT_DIR) {
                            await mkdir(process.env.WDF5_SCREENSHOT_DIR, { recursive: true });
                            await page.screenshot({ path: path.join(process.env.WDF5_SCREENSHOT_DIR, `${role}-${width}.png`), fullPage: true });
                        }
                        if (width === 1280) {
                            const apiPort = api.ready.port;
                            await api.stop();
                            await page.reload({ waitUntil: "networkidle0" });
                            await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Could not reach the API."), { timeout: 5000 });
                            assert.equal((await request(frontend.url)).status, 200);
                            api = await start(path.join(pack, role, "backend/src/server.js"), { PORT: String(apiPort), FRONTEND_ORIGIN: frontend.url, REGION: "local" });
                            await page.reload({ waitUntil: "networkidle0" });
                            await page.waitForFunction(() => document.querySelector("#status").textContent.includes("API is running."), { timeout: 5000 });
                        }
                    } finally { await page.close(); }
                }
            }
        } finally {
            if (closeBrowser) await closeBrowser();
            await api?.stop();
            await frontend?.stop();
            await rm(scratch, { recursive: true, force: true });
        }
    });
}
