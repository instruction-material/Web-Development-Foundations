import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { Server } from "socket.io";
import { Note } from "../WDF2-Notes-App-with-MongoDB/solution/src/models/note.js";

for (const role of ["starter", "solution"]) {
    test(role + " contact mailer retains JSON-only local delivery", async () => {
        const previousHost = process.env.SMTP_HOST;
        delete process.env.SMTP_HOST;
        try {
            const { createMailer } = await import("../WDF3-Booking-Contact-App/" + role + "/src/lib/mailer.js");
            const mailer = createMailer();
            try {
                const info = await mailer.sendMail({
                    from: "sender@example.invalid",
                    to: "recipient@example.invalid",
                    subject: "Fictional workshop request",
                    text: "No external delivery is performed.",
                });
                const message = JSON.parse(info.message);
                assert.equal(message.subject, "Fictional workshop request");
                assert.equal(message.text, "No external delivery is performed.");
                assert.deepEqual(info.envelope.to, ["recipient@example.invalid"]);
            } finally {
                mailer.close();
            }
        } finally {
            if (previousHost === undefined) delete process.env.SMTP_HOST;
            else process.env.SMTP_HOST = previousHost;
        }
    });
}

test("notes model validates and trims without opening a database", async () => {
    const note = new Note({ title: "  Orbit notes  ", body: "  A fictional observation.  " });
    await note.validate();
    assert.equal(note.title, "Orbit notes");
    assert.equal(note.body, "A fictional observation.");
    assert.deepEqual(note.tags, []);
    await assert.rejects(new Note({ title: " ", body: "Valid body" }).validate(), /title/);
    await assert.rejects(new Note({ title: "x".repeat(121), body: "Valid body" }).validate(), /title/);
    await assert.rejects(new Note({ title: "Valid", body: "x".repeat(2001) }).validate(), /body/);
    assert.equal(Note.db.readyState, 0);
});

test("Socket.IO and Engine.IO exchange a real loopback WebSocket event", { timeout: 8000 }, async () => {
    const server = createServer();
    const io = new Server(server);
    let client;
    let deadline;
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        io.on("connection", socket => {
            socket.on("course:echo", value => socket.emit("course:echo", value));
        });
        await new Promise((resolve, reject) => {
            deadline = setTimeout(() => reject(new Error("Loopback event timed out")), 5000);
            client = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=websocket`);
            client.addEventListener("error", () => reject(new Error("Loopback WebSocket failed")));
            client.addEventListener("message", event => {
                try {
                    const packet = String(event.data);
                    if (packet.startsWith("0")) {
                        assert.ok(JSON.parse(packet.slice(1)).sid);
                        client.send("40");
                    } else if (packet.startsWith("40")) {
                        client.send('42["course:echo",{"text":"雪の星"}]');
                    } else if (packet.startsWith("42")) {
                        assert.deepEqual(JSON.parse(packet.slice(2)), ["course:echo", { text: "雪の星" }]);
                        resolve();
                    } else if (packet === "2") client.send("3");
                } catch (error) {
                    reject(error);
                }
            });
        });
    } finally {
        clearTimeout(deadline);
        client?.close();
        await new Promise(resolve => io.close(resolve));
        server.closeAllConnections();
    }
});
