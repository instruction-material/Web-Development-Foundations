import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseContact } from "./validation.js";
import { createDelivery } from "./lib/mailer.js";

const publicPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
const errorBody = (code, fields) => ({
    ok: false,
    error: { code, ...(fields ? { fields } : {}) },
});

export function createContactApp({
    deliver = createDelivery(),
    log = event => console.log(JSON.stringify(event)),
    now = Date.now,
    deliveryTimeoutMs = 750,
} = {}) {
    const app = express();
    let attempts = 0;
    let windowStart = now();
    app.disable("x-powered-by");

    const fail = (response, status, code, fields) => {
        response.locals.outcome = code;
        return response.status(status).json(errorBody(code, fields));
    };
    app.get("/health", (_request, response) => response.json({ ok: true }));
    app.all("/api/contact", (request, response, next) => {
        response.once("finish", () => log({
            event: "contact_request",
            status: response.statusCode,
            outcome: response.locals.outcome ?? "internal_error",
        }));
        if (request.method !== "POST") {
            response.set("Allow", "POST");
            return fail(response, 405, "method_not_allowed");
        }
        if (now() - windowStart >= 10000) {
            attempts = 0;
            windowStart = now();
        }
        if (++attempts > 6) {
            response.set("Retry-After", String(Math.max(1, Math.ceil((10000 - (now() - windowStart)) / 1000))));
            return fail(response, 429, "rate_limited");
        }
        if (!request.is("application/json")) {
            return fail(response, 415, "unsupported_media_type");
        }
        next();
    });
    app.post("/api/contact",
        express.json({ limit: 8192, strict: true, inflate: false }),
        async (request, response) => {
            const parsed = parseContact(request.body);
            if (parsed.notImplemented) return fail(response, 501, "not_implemented");
            if (!parsed.ok) return fail(response, 400, "invalid_contact", parsed.fields);

            const controller = new AbortController();
            let timer;
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => {
                    const error = new Error("Delivery deadline reached");
                    error.code = "CONTACT_TIMEOUT";
                    reject(error);
                    controller.abort();
                }, deliveryTimeoutMs);
            });
            try {
                await Promise.race([
                    Promise.resolve().then(() => deliver(parsed.value, { signal: controller.signal })),
                    timeout,
                ]);
                response.locals.outcome = "simulated";
                return response.status(202).json({ ok: true, delivery: "simulated" });
            } catch (error) {
                return fail(response, error?.code === "CONTACT_TIMEOUT" ? 504 : 503,
                    error?.code === "CONTACT_TIMEOUT" ? "delivery_timeout" : "delivery_unavailable");
            } finally {
                clearTimeout(timer);
                controller.abort();
            }
        });
    app.use("/api", (_request, response) => fail(response, 404, "not_found"));
    app.use(express.static(publicPath, { dotfiles: "deny" }));
    app.use((_request, response) => fail(response, 404, "not_found"));
    app.use((error, _request, response, _next) => {
        if (response.headersSent) return;
        const codes = {
            "entity.too.large": [413, "body_too_large"],
            "entity.parse.failed": [400, "invalid_json"],
            "encoding.unsupported": [415, "unsupported_media_type"],
            "charset.unsupported": [415, "unsupported_media_type"],
            "request.aborted": [400, "invalid_request"],
            "request.size.invalid": [400, "invalid_request"],
        };
        const [status, code] = codes[error.type] ?? [500, "internal_error"];
        return fail(response, status, code);
    });
    return app;
}
