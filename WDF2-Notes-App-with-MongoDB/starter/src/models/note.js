import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export function noteError(status, code) {
    return Object.assign(new Error(code), { status, code });
}

const text = max => z.string().trim().min(1).max(max)
    .refine(value => value.isWellFormed());
const fields = {
    title: text(120),
    body: text(2000),
    tags: z.array(text(24)).max(8)
        .refine(values => new Set(values).size === values.length).default([]),
};
const inputSchema = z.strictObject(fields);

export function validateNoteInput(input) {
    // TODO: implement the strict input contract in the README.
    throw noteError(501, "not_implemented");
}

export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const instant = z.string().refine(value => {
    const date = new Date(value);
    return Number.isFinite(date.valueOf()) && date.toISOString() === value;
});
const savedSchema = z.strictObject({
    ...fields, id: z.string().regex(idPattern), createdAt: instant, updatedAt: instant,
}).refine(row => Date.parse(row.updatedAt) >= Date.parse(row.createdAt));

export function validateSnapshot(input) {
    const parsed = z.strictObject({
        schemaVersion: z.literal(1), notes: z.array(savedSchema).max(50),
    }).safeParse(input);
    if (!parsed.success) throw noteError(400, "invalid_snapshot");
    const notes = parsed.data.notes;
    if (new Set(notes.map(row => row.id)).size !== notes.length ||
        new Set(notes.map(row => row.title)).size !== notes.length) {
        throw noteError(400, "invalid_snapshot");
    }
    // A snapshot is an exact stored representation, not an input-normalization path.
    for (let i = 0; i < notes.length; i++) {
        const a = input.notes[i], b = notes[i];
        if (a.title !== b.title || a.body !== b.body ||
            !Array.isArray(a.tags) || JSON.stringify(a.tags) !== JSON.stringify(b.tags)) {
            throw noteError(400, "invalid_snapshot");
        }
    }
    return structuredClone(notes);
}

const schema = new mongoose.Schema({
    _id: { type: String, default: randomUUID, match: idPattern },
    title: { type: String, trim: true, required: true, maxlength: 120 },
    body: { type: String, trim: true, required: true, maxlength: 2000 },
    tags: { type: [String], default: [], validate: values => values.length <= 8 &&
        values.every(value => value.length >= 1 && value.length <= 24 && value === value.trim() && value.isWellFormed()) &&
        new Set(values).size === values.length },
    createdAt: { type: Date, default: Date.now, required: true, immutable: true },
    updatedAt: { type: Date, default: Date.now, required: true },
}, { versionKey: false, id: false, strict: "throw", bufferCommands: false });
// Serves exact-title lookup and enforces this lab's case-sensitive title uniqueness.
schema.index({ title: 1 }, { unique: true });
export const Note = new mongoose.Mongoose().model("Note", schema);
export function noteModel(connection) {
    return connection.model("Note", schema.clone());
}
