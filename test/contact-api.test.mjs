import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pack = path.join(root, "WDF3-Booking-Contact-App");
const good = { name: "Fictional Reader", replyTo: "reader@example.invalid", topic: "project", message: "A fictional project request." };
const completion = `
export function parseContact(input) {
    const keys = ["name", "replyTo", "topic", "message"];
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, fields: ["request"] };
    const fields = Object.keys(input).some(key => !keys.includes(key)) ? ["request"] : [];
    const value = {};
    for (const key of keys) {
        if (typeof input[key] !== "string") { fields.push(key); continue; }
        value[key] = key === "topic" ? input[key] : input[key].trim();
    }
    if (typeof value.name === "string" && (value.name.length < 2 || value.name.length > 80)) fields.push("name");
    if (typeof value.replyTo === "string" && (value.replyTo.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value.replyTo))) fields.push("replyTo");
    if (typeof value.topic === "string" && !["project", "lesson"].includes(value.topic)) fields.push("topic");
    if (typeof value.message === "string" && (value.message.length < 10 || value.message.length > 2000)) fields.push("message");
    return fields.length ? { ok: false, fields: [...new Set(fields)] } : { ok: true, value };
}
`;

const email254 = "x".repeat(64) + "@" + "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(56) + ".test";
assert.equal(email254.length, 254);
const accepted = [
    good,
    { ...good, name: "  雪星  ", replyTo: " reader@example.invalid ", message: "  <b>Fictional text</b>  " },
    { ...good, name: "AB", topic: "lesson", message: "1234567890" },
    { ...good, name: "😀".repeat(40), message: "😀".repeat(1000) },
    { ...good, name: "x".repeat(80), replyTo: email254, message: "x".repeat(2000) },
];
const rejected = [
    null, [], "text", 42, {},
    { ...good, extra: true },
    { ...good, name: " " }, { ...good, name: "A" }, { ...good, name: "x".repeat(81) },
    { ...good, name: "😀".repeat(41) }, { ...good, message: "😀".repeat(1001) },
    { ...good, name: 42 }, { ...good, replyTo: "x@x" }, { ...good, replyTo: "x@@x.invalid" },
    { ...good, replyTo: "x".repeat(255) + "@example.invalid" }, { ...good, replyTo: null },
    { ...good, topic: "other" }, { ...good, topic: " project " }, { ...good, topic: 0 },
    { ...good, message: " " }, { ...good, message: "123456789" },
    { ...good, message: "x".repeat(2001) }, { ...good, message: {} },
    ...Object.keys(good).map(key => Object.fromEntries(Object.entries(good).filter(([name]) => name !== key))),
];

async function listen(app) {
    const server = createServer(app);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    return {
        origin: "http://127.0.0.1:" + server.address().port,
        async close() {
            await new Promise(resolve => {
                server.close(resolve);
                server.closeAllConnections();
            });
        },
    };
}

async function exercise(profile) {
    const { parseContact } = await import(pathToFileURL(path.join(profile, "src/validation.js")));
    for (const value of accepted) {
        const before = structuredClone(value);
        assert.deepEqual(parseContact(value), { ok: true, value: {
            name: value.name.trim(), replyTo: value.replyTo.trim(), topic: value.topic, message: value.message.trim(),
        } });
        assert.deepEqual(value, before);
    }
    for (const value of rejected) {
        const before = structuredClone(value);
        const parsed = parseContact(value);
        assert.equal(parsed.ok, false, JSON.stringify(value));
        assert.ok(parsed.fields.length);
        assert.ok(parsed.fields.every(field => ["request", "name", "replyTo", "topic", "message"].includes(field)));
        assert.equal(new Set(parsed.fields).size, parsed.fields.length);
        assert.deepEqual(value, before);
    }
    const { createContactApp } = await import(pathToFileURL(path.join(profile, "src/app.js")));
    const logs = [];
    const deliveries = [];
    let time = 100000;
    const service = await listen(createContactApp({
        deliver: async value => { deliveries.push(value); },
        log: value => logs.push(value),
        now: () => time,
    }));
    const request = async (body, options = {}) => {
        time += 10001;
        const response = await fetch(service.origin + "/api/contact", {
            method: options.method ?? "POST",
            headers: options.headers ?? { "Content-Type": "application/json" },
            ...(options.method === "GET" ? {} : { body: options.raw ?? JSON.stringify(body) }),
        });
        assert.match(response.headers.get("content-type"), /application\/json/);
        return { status: response.status, headers: response.headers, body: await response.json() };
    };
    try {
        for (const value of accepted) {
            const response = await request(value);
            assert.equal(response.status, 202);
            assert.deepEqual(response.body, { ok: true, delivery: "simulated" });
        }
        const deliveryCount = deliveries.length;
        for (const value of rejected) {
            const response = await request(value);
            assert.equal(response.status, 400);
            assert.equal(response.body.ok, false);
            assert.ok(["invalid_contact", "invalid_json"].includes(response.body.error.code));
        }
        for (const [options, status, code] of [
            [{ raw: "{" }, 400, "invalid_json"],
            [{ raw: JSON.stringify({ message: "x".repeat(9000) }) }, 413, "body_too_large"],
            [{ headers: { "Content-Type": "text/plain" } }, 415, "unsupported_media_type"],
            [{ headers: {} }, 415, "unsupported_media_type"],
            [{ headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" } }, 415, "unsupported_media_type"],
            [{ method: "GET" }, 405, "method_not_allowed"],
        ]) {
            const response = await request(good, options);
            assert.equal(response.status, status);
            assert.equal(response.body.error.code, code);
            if (status === 405) assert.equal(response.headers.get("allow"), "POST");
        }
        assert.equal(deliveries.length, deliveryCount);
        const missing = await fetch(service.origin + "/api/missing");
        assert.equal(missing.status, 404);
        assert.equal((await missing.json()).error.code, "not_found");
        time += 10001;
        for (let attempt = 1; attempt <= 7; attempt++) {
            const response = await fetch(service.origin + "/api/contact", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(good),
            });
            assert.equal(response.status, attempt <= 6 ? 202 : 429);
            if (attempt === 7) {
                assert.equal(response.headers.get("retry-after"), "10");
                assert.equal((await response.json()).error.code, "rate_limited");
            } else await response.arrayBuffer();
        }
        assert.equal(deliveries.length, deliveryCount + 6);
        assert.equal((await request(good)).status, 202);
        const health = await fetch(service.origin + "/health");
        assert.deepEqual(await health.json(), { ok: true });
        assert.ok(logs.length > 30);
        for (const event of logs) assert.deepEqual(Object.keys(event).sort(), ["event", "outcome", "status"]);
        const serialized = JSON.stringify(logs);
        for (const secret of [good.name, good.replyTo, good.message, "<b>", "Error:", " at "]) {
            assert.equal(serialized.includes(secret), false);
        }
    } finally {
        await service.close();
    }
    return { validationCases: accepted.length + rejected.length };
}

test("contact reference and independently completed starter satisfy real HTTP contracts", { timeout: 20000 }, async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "wdf-contact-completion-"));
    try {
        const completed = path.join(temporary, "role");
        await cp(path.join(pack, "starter"), completed, { recursive: true });
        await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
        await writeFile(path.join(completed, "src/validation.js"), completion);
        await exercise(path.join(pack, "solution"));
        await exercise(completed);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
});

test("unfinished contact starter refuses delivery without accepting invented success", async () => {
    const { createContactApp } = await import("../WDF3-Booking-Contact-App/starter/src/app.js");
    let deliveries = 0;
    const service = await listen(createContactApp({ deliver: async () => { deliveries++; }, log: () => {} }));
    try {
        const response = await fetch(service.origin + "/api/contact", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(good),
        });
        assert.equal(response.status, 501);
        assert.deepEqual(await response.json(), { ok: false, error: { code: "not_implemented" } });
        assert.equal(deliveries, 0);
    } finally {
        await service.close();
    }
});

test("delivery rejection, cancellation and recovery retain safe responses and health", { timeout: 5000 }, async () => {
    const { createContactApp } = await import("../WDF3-Booking-Contact-App/solution/src/app.js");
    let scenario = "fail";
    let cancelled = 0;
    const logs = [];
    const service = await listen(createContactApp({
        log: value => logs.push(value),
        deliveryTimeoutMs: 35,
        deliver: async (_contact, { signal }) => {
            if (scenario === "fail") throw new Error("PRIVATE provider response and address");
            if (scenario === "primitive") throw undefined;
            if (scenario === "timeout") await new Promise((_, reject) => signal.addEventListener("abort", () => {
                cancelled++;
                reject(new Error("PRIVATE timeout detail"));
            }, { once: true }));
        },
    }));
    try {
        for (const [name, status, code] of [
            ["fail", 503, "delivery_unavailable"],
            ["primitive", 503, "delivery_unavailable"],
            ["timeout", 504, "delivery_timeout"],
            ["ok", 202, null],
        ]) {
            scenario = name;
            const response = await fetch(service.origin + "/api/contact", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(good),
            });
            assert.equal(response.status, status);
            const body = await response.json();
            if (code) assert.deepEqual(body, { ok: false, error: { code } });
            else assert.deepEqual(body, { ok: true, delivery: "simulated" });
            const health = await fetch(service.origin + "/health");
            assert.deepEqual(await health.json(), { ok: true });
        }
        assert.equal(cancelled, 1);
        assert.equal(JSON.stringify(logs).includes("PRIVATE"), false);
    } finally {
        await service.close();
    }
});

async function cli(scenario, port, callback) {
    const cwd = path.join(pack, "solution");
    const command = [process.execPath, "src/server.js"];
    const child = spawn(command[0], command.slice(1), {
        cwd,
        env: { ...process.env, PORT: String(port), CONTACT_SCENARIO: scenario, SMTP_HOST: "smtp.example.invalid" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const startedAt = new Date().toISOString();
    console.log(JSON.stringify({ event: "child-start", parentTask: process.env.CLASSES_FAMILY_TASK_ID ?? "contact-api-contracts", cwd, command, pid: child.pid, parentPid: process.pid, startedAt, timeoutMs: 5000 }));
    const exited = once(child, "exit");
    let stdout = "", stderr = "", timer;
    child.stdout.on("data", value => { stdout += value; });
    child.stderr.on("data", value => { stderr += value; });
    try {
        const ready = await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Course server readiness timed out")), 5000);
            child.once("error", reject);
            child.once("exit", () => reject(new Error("Course server failed: " + stderr)));
            child.stdout.on("data", () => {
                for (const line of stdout.trim().split("\n")) {
                    try {
                        const event = JSON.parse(line);
                        if (event.event === "ready") resolve(event);
                    } catch {}
                }
            });
        });
        clearTimeout(timer);
        assert.equal(ready.host, "127.0.0.1");
        await callback("http://127.0.0.1:" + ready.port, ready.port);
    } finally {
        clearTimeout(timer);
        if (child.exitCode === null) child.kill("SIGTERM");
        const force = setTimeout(() => child.kill("SIGKILL"), 1000);
        const [code, signal] = await exited;
        clearTimeout(force);
        console.log(JSON.stringify({ event: "child-end", pid: child.pid, startedAt, endedAt: new Date().toISOString(), exitCode: code, signal, cleanup: "owned server terminated and awaited" }));
        assert.equal(code, 0, stderr);
        assert.equal(signal, null);
        assert.equal(stderr, "");
        assert.match(stdout, /"event":"stopped"/);
    }
}

test("documented server CLI exercises JSON-only delivery, faults and same-port restart", { timeout: 12000 }, async () => {
    let selectedPort;
    for (const [scenario, status] of [["ok", 202], ["fail", 503], ["timeout", 504], ["ok", 202]]) {
        await cli(scenario, selectedPort ?? 0, async (origin, port) => {
            selectedPort = port;
            const page = await fetch(origin);
            assert.match(await page.text(), /Local contact lab/);
            const response = await fetch(origin + "/api/contact", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(good),
            });
            assert.equal(response.status, status);
            await response.arrayBuffer();
            const health = await fetch(origin + "/health");
            assert.deepEqual(await health.json(), { ok: true });
            for (const hidden of ["/.env.example", "/src/server.js", "/package.json"]) {
                const absent = await fetch(origin + hidden);
                assert.equal(absent.status, 404);
                await absent.arrayBuffer();
            }
        });
    }
});

