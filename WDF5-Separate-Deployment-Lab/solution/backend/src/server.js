import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 4001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:4173";
const region = process.env.REGION ?? "local";

app.use(cors({ origin: frontendOrigin }));

app.get("/api/status", (_request, response) => {
    response.json({
        message: "Solution API is running.",
        region,
    });
});

app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
});

const server = app.listen(port, "127.0.0.1", () => {
    const address = server.address();
    console.log(JSON.stringify({ event: "ready", service: "api", host: address.address, port: address.port }));
});
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close());
}
