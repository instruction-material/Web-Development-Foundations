import express from "express";
import { fileURLToPath } from "node:url";
import { createNotesRouter } from "./routes/notes.js";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
export function createApp(store, log = () => {}) {
    const app = express();
    app.disable("x-powered-by");
    app.use((_request, response, next) => {
        response.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
        response.once("finish", () => log({ event: "request", status: response.statusCode }));
        next();
    });
    app.get("/health", (_request, response) => response.json({ ok: true, store: store.kind }));
    app.get("/api/ready", (_request, response) => {
        const ready = store.ready();
        response.status(ready ? 200 : 503).json({ ready });
    });
    app.use("/api/notes", (request, response, next) => {
        if (["POST", "PUT"].includes(request.method) && !request.is("application/json")) {
            return response.status(415).json({ error: "json_required" });
        }
        next();
    }, express.json({ limit: "16kb", strict: false }), createNotesRouter(store));
    for (const [url, file] of [["/", "index.html"], ["/app.js", "app.js"], ["/styles.css", "styles.css"]]) {
        app.get(url, (_request, response) => response.sendFile(file, { root: publicRoot }));
    }
    app.use((request, response) => {
        if (request.path.startsWith("/api/")) return response.status(404).json({ error: "not_found" });
        response.status(404).type("text").send("Not found");
    });
    app.use((error, _request, response, _next) => {
        if (error.type === "entity.too.large") return response.status(413).json({ error: "body_too_large" });
        if (error.type === "entity.parse.failed") return response.status(400).json({ error: "invalid_json" });
        if (error.code === 11000) return response.status(409).json({ error: "note_conflict" });
        const known = ["invalid_note", "not_implemented", "invalid_query", "invalid_id", "note_not_found", "note_limit", "note_conflict"];
        if (known.includes(error.code)) return response.status(error.status).json({ error: error.code });
        response.status(503).json({ error: "storage_unavailable" });
    });
    return app;
}
