import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { noteError, noteModel, validateSnapshot } from "./models/note.js";

export const seedSnapshot = {
    schemaVersion: 1,
    notes: [{
        id: "00000000-0000-4000-8000-000000000001",
        title: "Fictional observation", body: "A seed note for the local data lab.",
        tags: ["example"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }],
};

function ordered(rows) {
    return rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function uniqueTitle(rows, title, exceptId) {
    if ([...rows.values()].some(row => row.id !== exceptId && row.title === title)) {
        throw noteError(409, "note_conflict");
    }
}

export async function replaceMemoryNote(rows, id, input, now) {
    const previous = rows.get(id);
    if (!previous) return null;
    uniqueTitle(rows, input.title, id);
    const next = { ...previous, ...structuredClone(input), updatedAt: Date.parse(now) < Date.parse(previous.updatedAt) ? previous.updatedAt : now };
    rows.set(id, next);
    return structuredClone(next);
}

export function memoryStore(snapshot = seedSnapshot) {
    const rows = new Map(validateSnapshot(snapshot).map(row => [row.id, row]));
    return {
        kind: "memory", ready: () => true, close: async () => {},
        list: async title => structuredClone(ordered([...rows.values()].filter(row => title === undefined || row.title === title))),
        read: async id => structuredClone(rows.get(id) ?? null),
        create: async input => {
            if (rows.size >= 50) throw noteError(409, "note_limit");
            uniqueTitle(rows, input.title);
            const instant = new Date().toISOString();
            const row = { ...structuredClone(input), id: randomUUID(), createdAt: instant, updatedAt: instant };
            rows.set(row.id, row);
            return structuredClone(row);
        },
        update: (id, input) => replaceMemoryNote(rows, id, input, new Date().toISOString()),
        remove: async id => rows.delete(id),
    };
}

export function localMongoUri(value) {
    // Only an explicitly named, isolated loopback learning database is accepted.
    if (!/^mongodb:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/wdf2_[a-z0-9_]+$/.test(value ?? "")) {
        throw noteError(400, "isolated_local_database_required");
    }
    const url = new URL(value);
    if (Number(url.port) > 65535) throw noteError(400, "isolated_local_database_required");
    return value;
}

function publicRecord(row) {
    if (!row) return null;
    return { id: row._id, title: row.title, body: row.body, tags: [...row.tags],
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function mongoStore(uri, snapshot) {
    const initial = snapshot ? validateSnapshot(snapshot) : null;
    const connection = mongoose.createConnection();
    try {
        await connection.openUri(localMongoUri(uri), {
            serverSelectionTimeoutMS: 1200, connectTimeoutMS: 1200,
            socketTimeoutMS: 1500, heartbeatFrequencyMS: 500,
            maxPoolSize: 2, retryWrites: false, retryReads: false,
        });
        const Model = noteModel(connection);
        await Model.init();
        const count = await Model.countDocuments().maxTimeMS(1000);
        if (initial && count !== 0) throw noteError(409, "restore_target_not_empty");
        if (count > 50) throw noteError(409, "note_limit");
        if (count > 0) {
            try {
                const existing = await Model.find().sort({ _id: 1 }).limit(50).maxTimeMS(1000).lean();
                validateSnapshot({ schemaVersion: 1, notes: existing.map(publicRecord) });
            } catch { throw noteError(409, "stored_data_requires_migration"); }
        }
        if (count === 0) {
            const rows = initial ?? validateSnapshot(seedSnapshot);
            if (rows.length) await Model.insertMany(rows.map(({ id, ...rest }) => ({ _id: id, ...rest })));
        }
        return {
            kind: "mongodb", ready: () => connection.readyState === 1,
            close: () => connection.close(),
            list: async title => (await Model.find(title === undefined ? {} : { title }).sort({ _id: 1 }).limit(50).maxTimeMS(1000).lean()).map(publicRecord),
            read: async id => publicRecord(await Model.findById(id).maxTimeMS(1000).lean()),
            create: async input => {
                if (await Model.countDocuments().maxTimeMS(1000) >= 50) throw noteError(409, "note_limit");
                const now = new Date();
                return publicRecord((await Model.create({ ...input, createdAt: now, updatedAt: now })).toObject());
            },
            update: async (id, input) => publicRecord(await Model.findByIdAndUpdate(id,
                { $set: input, $max: { updatedAt: new Date() } },
                { returnDocument: "after", runValidators: true }).maxTimeMS(1000).lean()),
            remove: async id => Boolean(await Model.findByIdAndDelete(id).maxTimeMS(1000)),
        };
    } catch (error) {
        await connection.close().catch(() => {});
        throw error;
    }
}
