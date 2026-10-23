import http from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 through 65535.");
}
const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/env.js", ["env.js", "text/javascript; charset=utf-8"]],
    ["/main.js", ["main.js", "text/javascript; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end("Method not allowed");
        return;
    }
    let pathname;
    try {
        pathname = new URL(request.url, "http://127.0.0.1").pathname;
    } catch {
        response.writeHead(400);
        response.end("Invalid URL");
        return;
    }
    const file = files.get(pathname);
    if (!file) {
        response.writeHead(404);
        response.end("Not found");
        return;
    }
    try {
        const body = await readFile(new URL(file[0], root));
        response.writeHead(200, { "Content-Type": file[1] });
        response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500);
        response.end(error.code === "ENOENT" ? "Not found" : "Read failed");
    }
});
server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    console.log(JSON.stringify({ event: "ready", service: "frontend", host: address.address, port: address.port }));
});
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
        server.close();
        server.closeAllConnections();
    });
}
