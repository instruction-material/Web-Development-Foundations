import { pathToFileURL } from "node:url";

const { server } = await import(pathToFileURL(process.argv[2]));
server.on("connection", () => process.send({ event: "accepted" }));
if (process.argv[3] === "drain") {
    server.prependListener("request", (_request, response) => {
        const end = response.end;
        response.end = (...args) => {
            process.send({ event: "responseReady" });
            process.once("message", message => {
                if (message.event === "releaseResponse") Reflect.apply(end, response, args);
            });
            process.channel.unref();
        };
    });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
    // Registered after the real handlers, so this acknowledges their execution.
    process.on(signal, () => process.send({ event: "shutdownRequested", signal }));
}
process.send({ event: "probeReady" });
process.channel.unref();
