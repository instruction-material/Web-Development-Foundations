import { createServer } from "node:http";
import { open, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const files = new Set([
    "index.html",
    "app.mjs",
    "state.mjs",
    "styles.css",
    "events.json",
    "empty.json",
    "invalid.json",
    "malformed.json",
    "history.json",
    "out-of-order.json",
]);

export async function startServer(root, port = 4174) {
    await access(join(root, "index.html"));
    const server = createServer(async (request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader(
            "Content-Security-Policy",
            "default-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        );
        if (!["GET", "HEAD"].includes(request.method)) {
            response.writeHead(405, { Allow: "GET, HEAD" });
            response.end("Method not allowed");
            return;
        }
        const pathname = new URL(request.url, "http://127.0.0.1").pathname;
        const name = pathname === "/" ? "index.html" : pathname.slice(1);
        if (!files.has(name)) {
            response.writeHead(404);
            response.end("Not found");
            return;
        }
        let handle;
        try {
            handle = await open(join(root, name));
            const buffer = Buffer.alloc(65537);
            let bytesRead = 0;
            while (bytesRead < buffer.length) {
                const part = await handle.read(
                    buffer,
                    bytesRead,
                    buffer.length - bytesRead,
                    bytesRead,
                );
                if (!part.bytesRead) break;
                bytesRead += part.bytesRead;
            }
            if (bytesRead > 65536) {
                response.writeHead(413);
                response.end("File too large");
                return;
            }
            const type = name.endsWith(".html")
                ? "text/html"
                : name.endsWith(".css")
                  ? "text/css"
                  : name.endsWith(".json")
                    ? "application/json"
                    : "text/javascript";
            response.writeHead(200, {
                "Content-Type": type + "; charset=utf-8",
                "Content-Length": bytesRead,
            });
            response.end(
                request.method === "HEAD"
                    ? undefined
                    : buffer.subarray(0, bytesRead),
            );
        } catch {
            response.writeHead(404);
            response.end("Not found");
        } finally {
            await handle?.close();
        }
    });
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 1000;
    server.maxConnections = 8;
    await new Promise((ready, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", ready);
    });
    return server;
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const role = process.argv[2] ?? ".";
    const port = Number(process.argv[3] ?? 4174);
    if (
        ![".", "starter", "solution"].includes(role) ||
        !Number.isInteger(port) ||
        (port !== 0 && (port < 1024 || port > 65535))
    ) {
        console.error("Use: node serve.mjs [starter|solution|.] [port]");
        process.exitCode = 1;
    } else {
        try {
            const server = await startServer(resolve(directory, role), port);
            console.log(
                JSON.stringify({
                    event: "listening",
                    host: "127.0.0.1",
                    port: server.address().port,
                    pid: process.pid,
                }),
            );
            for (const signal of ["SIGINT", "SIGTERM"])
                process.once(signal, () => {
                    server.closeAllConnections();
                    server.close(() => process.exit(0));
                });
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        }
    }
}
