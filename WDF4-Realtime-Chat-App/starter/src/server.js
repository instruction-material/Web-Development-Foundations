import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const port = Number(process.env.PORT ?? 3003);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 through 65535.");
}
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 8 * 1024 });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));

function textValue(value, maximum) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 && text.length <= maximum ? text : null;
}
function reply(acknowledge, result) {
    if (typeof acknowledge === "function") acknowledge(result);
}

io.on("connection", (socket) => {
    socket.on("chat:message", (value, acknowledge) => {
        const message = textValue(value, 280);
        if (message === null) {
            reply(acknowledge, { ok: false, error: "message_invalid" });
            return;
        }
        io.emit("chat:message", message);
        reply(acknowledge, { ok: true });
    });
});

let closing = false;
function close() {
    if (closing) return;
    closing = true;
    io.close(() => console.log(JSON.stringify({ event: "closed" })));
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
server.once("error", (error) => {
    console.error(
        JSON.stringify({ event: "error", code: error.code ?? "listen_failed" }),
    );
    process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
    console.log(
        JSON.stringify({
            event: "ready",
            host: "127.0.0.1",
            port: server.address().port,
            pid: process.pid,
        }),
    );
});
