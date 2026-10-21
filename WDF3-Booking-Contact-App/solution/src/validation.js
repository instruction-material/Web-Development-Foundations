import { z } from "zod";

const schema = z.strictObject({
    name: z.string().trim().min(2).max(80),
    replyTo: z.string().trim().max(254).email(),
    topic: z.enum(["project", "lesson"]),
    message: z.string().trim().min(10).max(2000),
});

export function parseContact(input) {
    const parsed = schema.safeParse(input);
    if (parsed.success) return { ok: true, value: parsed.data };
    const fields = [...new Set(parsed.error.issues.map(issue =>
        ["name", "replyTo", "topic", "message"].includes(issue.path[0])
            ? issue.path[0] : "request"))];
    return { ok: false, fields };
}
