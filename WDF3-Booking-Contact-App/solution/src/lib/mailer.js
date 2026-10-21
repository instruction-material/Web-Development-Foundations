import nodemailer from "nodemailer";
import { setTimeout as delay } from "node:timers/promises";

export function createMailer() {
    return nodemailer.createTransport({ jsonTransport: true });
}

export function createDelivery(scenario = "ok") {
    if (!["ok", "fail", "timeout"].includes(scenario)) throw new Error("Invalid scenario");
    const mailer = createMailer();
    return async (contact, { signal }) => {
        signal.throwIfAborted();
        if (scenario === "fail") throw new Error("Simulated provider failure");
        if (scenario === "timeout") await delay(30000, undefined, { signal });
        signal.throwIfAborted();
        await mailer.sendMail({
            to: "inbox@example.invalid",
            from: "course@example.invalid",
            replyTo: contact.replyTo,
            subject: "Fictional contact request",
            text: contact.name + "\n" + contact.topic + "\n\n" + contact.message,
        });
        signal.throwIfAborted();
    };
}
