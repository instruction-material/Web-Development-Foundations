import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createContactApp } from "./app.js";
import { createDelivery } from "./lib/mailer.js";

export async function startContactServer({
    port = Number(process.env.PORT ?? 3002),
    scenario = process.env.CONTACT_SCENARIO ?? "ok",
    log = event => console.log(JSON.stringify(event)),
} = {}) {
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("Invalid port");
    }
    const server = createServer(createContactApp({ deliver: createDelivery(scenario), log }));
    server.requestTimeout = 10000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 1000;
    server.maxRequestsPerSocket = 20;
    server.maxConnections = 20;
    server.dropMaxConnection = true;
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
    });
    return {
        server,
        port: server.address().port,
        async close() {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
                server.closeAllConnections();
            });
        },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const service = await startContactServer();
        console.log(JSON.stringify({ event: "ready", host: "127.0.0.1", port: service.port }));
        let stopping = false;
        const stop = async () => {
            if (stopping) return;
            stopping = true;
            try {
                await service.close();
                console.log(JSON.stringify({ event: "stopped" }));
            } catch {
                console.error(JSON.stringify({ event: "stop_failed" }));
                process.exitCode = 1;
            }
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    } catch {
        console.error(JSON.stringify({ event: "start_failed", code: "check_port_and_scenario" }));
        process.exitCode = 1;
    }
}
