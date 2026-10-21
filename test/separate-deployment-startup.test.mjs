import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { appendFileSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
        return { ready, pid: child.pid, url: `http://127.0.0.1:${ready.port}`, stop };
    } catch (error) {
        await stop();
        throw error;
    } finally { clearTimeout(deadline); }
}
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(2000) });

function artifactCLI(project, args, expectedExit = 0) {
    const command = [process.execPath, path.join(project, "release.mjs"), ...args];
    const startedAt = new Date().toISOString();
    const result = spawnSync(command[0], command.slice(1), {
        cwd: project, encoding: "utf8", timeout: 10000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024,
    });
    const accepted = !result.error && result.status === expectedExit;
    log({ event: "run", kind: "artifact-cli", cwd: project, command, pid: result.pid, startedAt,
        finishedAt: new Date().toISOString(), timeoutMs: 10000, expectedExit, exitCode: result.status,
        signal: result.signal, accepted, cleanup: "synchronous child exited and reaped; no descendants" });
    assert.ifError(result.error);
    assert.equal(result.status, expectedExit, result.stderr || result.stdout);
    const value = JSON.parse(expectedExit === 0 ? result.stdout : result.stderr);
    assert.equal(value.ok, expectedExit === 0);
    return value;
}
async function artifactProject(role, scratch, apiUrl) {
    const project = path.join(scratch, "source-project");
    const source = path.join(project, "frontend");
    await mkdir(source, { recursive: true });
    const names = ["index.html", "main.js", "env.js", "serve.mjs", ...(role === "solution" ? ["styles.css"] : [])];
    for (const name of names) await cp(path.join(scratch, name), path.join(source, name));
    for (const name of ["release.mjs", "release-model.mjs"]) await cp(path.join(pack, role, name), path.join(project, name));
    const releaseA = path.join(scratch, "release-a");
    const modelPath = path.join(project, "release-model.mjs");
    if (role === "starter") {
        assert.equal(artifactCLI(project, ["build", releaseA], 1).error, "not_implemented_digest");
        await assert.rejects(lstat(releaseA), { code: "ENOENT" });
        let model = await readFile(modelPath, "utf8");
        const digestTodo = 'throw artifactError("not_implemented_digest");';
        const inventoryTodo = 'throw artifactError("not_implemented_inventory");';
        assert.ok(model.includes(digestTodo) && model.includes(inventoryTodo));
        // Complete only the disposable learner copy with an independent sorted-inventory approach.
        model = model.replace(digestTodo, 'return createHash("sha256").update(bytes).digest("hex");');
        model = model.replace(inventoryTodo, `const canonical = rows => {
            if (!Array.isArray(rows) || new Set(rows.map(row => row.name)).size !== rows.length) {
                throw artifactError("artifact_integrity_mismatch");
            }
            return rows.map(row => [row.name, row.bytes, row.sha256]).sort((a, b) => a[0].localeCompare(b[0]));
        };
        if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(actual))) {
            throw artifactError("artifact_integrity_mismatch");
        }`);
        await writeFile(modelPath, model);
    }
    const model = await import(pathToFileURL(modelPath));
    assert.equal(model.digestBytes(Buffer.alloc(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(model.digestBytes(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const rows = [{ name: "a", bytes: 3, sha256: "abc" }, { name: "b", bytes: 4, sha256: "def" }];
    const reversed = [...rows].reverse();
    const snapshot = JSON.stringify([rows, reversed]);
    model.assertInventory(rows, reversed);
    assert.equal(JSON.stringify([rows, reversed]), snapshot);
    for (const invalid of [rows.slice(1), [rows[0], rows[0]], [{ ...rows[0], bytes: 4 }, rows[1]], [{ ...rows[0], sha256: "other" }, rows[1]]]) {
        assert.throws(() => model.assertInventory(rows, invalid), { code: "artifact_integrity_mismatch" });
        assert.throws(() => model.assertInventory(invalid, rows), { code: "artifact_integrity_mismatch" });
    }
    const originals = new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(source, name))])));
    await writeFile(path.join(source, ".private-note"), "not a public artifact input");
    const built = artifactCLI(project, ["build", releaseA]);
    assert.equal(built.role, role);
    assert.equal(built.files, names.length);
    assert.equal(artifactCLI(project, ["verify", releaseA]).manifestSHA256, built.manifestSHA256);
    const manifestPath = path.join(releaseA, "artifact-manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes);
    assert.deepEqual(manifest.files.map(row => row.name).sort(), [...names].sort());
    await assert.rejects(lstat(path.join(releaseA, ".private-note")), { code: "ENOENT" });
    for (const [name, bytes] of originals) assert.deepEqual(await readFile(path.join(source, name)), bytes);
    const malformed = [
        ["changed", async target => writeFile(path.join(target, "main.js"), "changed"), "artifact_integrity_mismatch"],
        ["extra", async target => writeFile(path.join(target, "extra.txt"), "extra"), "unexpected_artifact_entries"],
        ["missing", async target => rm(path.join(target, "main.js")), "unexpected_artifact_entries"],
        ["invalid-json", async target => writeFile(path.join(target, "artifact-manifest.json"), "{"), "invalid_artifact_manifest"],
        ["wrong-role", async target => writeFile(path.join(target, "artifact-manifest.json"), JSON.stringify({ ...manifest, role: "other" })), "invalid_artifact_manifest"],
        ["duplicate", async target => writeFile(path.join(target, "artifact-manifest.json"), JSON.stringify({ ...manifest, files: manifest.files.map((row, i) => i === 1 ? manifest.files[0] : row) })), "invalid_artifact_manifest"],
        ["traversal", async target => writeFile(path.join(target, "artifact-manifest.json"), JSON.stringify({ ...manifest, files: manifest.files.map((row, i) => i === 0 ? { ...row, name: "../main.js" } : row) })), "invalid_artifact_manifest"],
        ["unknown-key", async target => writeFile(path.join(target, "artifact-manifest.json"), JSON.stringify({ ...manifest, extra: true })), "invalid_artifact_manifest"],
        ["symlink", async target => { await rm(path.join(target, "main.js")); await symlink(path.join(source, "main.js"), path.join(target, "main.js")); }, "unexpected_artifact_entries"],
    ];
    for (const [label, change, error] of malformed) {
        const target = path.join(scratch, "invalid-" + label);
        await cp(releaseA, target, { recursive: true });
        await change(target);
        assert.equal(artifactCLI(project, ["verify", target], 1).error, error);
    }
    const rejectedRestore = path.join(scratch, "rejected-restore");
    assert.equal(artifactCLI(project, ["restore", path.join(scratch, "invalid-changed"), rejectedRestore], 1).error, "artifact_integrity_mismatch");
    await assert.rejects(lstat(rejectedRestore), { code: "ENOENT" });
    assert.equal(artifactCLI(project, ["build", releaseA], 1).error, "target_already_exists");
    assert.equal(artifactCLI(project, ["build", path.join(source, "nested")], 1).error, "independent_target_required");
    assert.equal(artifactCLI(project, ["restore", releaseA, path.join(releaseA, "nested")], 1).error, "independent_target_required");
    await writeFile(path.join(source, "main.js"), Buffer.alloc(model.MAX_FILE_BYTES + 1));
    const oversized = path.join(scratch, "oversized");
    assert.equal(artifactCLI(project, ["build", oversized], 1).error, "artifact_too_large");
    await assert.rejects(lstat(oversized), { code: "ENOENT" });
    await writeFile(path.join(source, "main.js"), originals.get("main.js"));
    const badConfig = `window.__APP_CONFIG__ = ${JSON.stringify({ apiBaseUrl: apiUrl + "/not-a-status-prefix" })};\n`;
    await writeFile(path.join(source, "env.js"), badConfig);
    const releaseB = path.join(scratch, "release-b");
    artifactCLI(project, ["build", releaseB]);
    artifactCLI(project, ["verify", releaseB]);
    const recovered = path.join(scratch, "restored-a");
    assert.equal(artifactCLI(project, ["restore", releaseA, recovered]).manifestSHA256, built.manifestSHA256);
    artifactCLI(project, ["verify", recovered]);
    for (const name of [...names, "artifact-manifest.json"]) {
        assert.deepEqual(await readFile(path.join(recovered, name)), await readFile(path.join(releaseA, name)));
    }
    assert.deepEqual(await readFile(manifestPath), manifestBytes);
    assert.equal(await readFile(path.join(source, "env.js"), "utf8"), badConfig);
    return { releaseA, releaseB, recovered, source, badConfig };
}

for (const role of ["starter", "solution"]) {
    test(`${role}: separate processes, artifact integrity and recovery`, { timeout: 60000 }, async () => {
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
            const artifacts = await artifactProject(role, scratch, api.url);
            const frontendPort = frontend.ready.port;
            const retainedApiPid = api.pid;
            await frontend.stop();
            frontend = await start(path.join(artifacts.releaseA, "serve.mjs"), { PORT: String(frontendPort) }, artifacts.releaseA);
            assert.equal((await request(frontend.url + "/artifact-manifest.json")).status, 404);
            assert.equal(api.pid, retainedApiPid);
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
                            await frontend.stop();
                            frontend = await start(path.join(artifacts.releaseB, "serve.mjs"), { PORT: String(frontendPort) }, artifacts.releaseB);
                            await page.reload({ waitUntil: "networkidle0" });
                            await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Could not reach the API."), { timeout: 5000 });
                            assert.equal((await request(api.url + "/api/status")).status, 200);
                            assert.equal(api.pid, retainedApiPid);
                            await frontend.stop();
                            frontend = await start(path.join(artifacts.recovered, "serve.mjs"), { PORT: String(frontendPort) }, artifacts.recovered);
                            await page.reload({ waitUntil: "networkidle0" });
                            await page.waitForFunction(() => document.querySelector("#status").textContent.includes("API is running."), { timeout: 5000 });
                            assert.equal(api.pid, retainedApiPid);
                            assert.equal(await readFile(path.join(artifacts.source, "env.js"), "utf8"), artifacts.badConfig);
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
