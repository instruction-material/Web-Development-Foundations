import { Router } from "express";
import { idPattern, noteError, validateNoteInput } from "../models/note.js";

export function createNotesRouter(store) {
    const router = Router();
    // One owned lab process serializes mutations. This is not a distributed lock.
    let tail = Promise.resolve();
    const mutation = action => {
        const result = tail.then(action);
        tail = result.catch(() => {});
        return result;
    };
    router.get("/snapshot", async (_request, response) => {
        response.json({ schemaVersion: 1, notes: await store.list() });
    });
    router.get("/", async (request, response) => {
        if (Object.keys(request.query).some(key => key !== "title") ||
            (request.query.title !== undefined && (typeof request.query.title !== "string" ||
            request.query.title.length < 1 || request.query.title.length > 120))) {
            throw noteError(400, "invalid_query");
        }
        response.json(await store.list(request.query.title));
    });
    router.post("/", async (request, response) => {
        const input = validateNoteInput(request.body);
        const note = await mutation(() => store.create(input));
        response.status(201).json(note);
    });
    router.param("id", (request, _response, next, id) => {
        if (!idPattern.test(id)) return next(noteError(400, "invalid_id"));
        next();
    });
    router.get("/:id", async (request, response) => {
        const row = await store.read(request.params.id);
        if (!row) throw noteError(404, "note_not_found");
        response.json(row);
    });
    router.put("/:id", async (request, response) => {
        const input = validateNoteInput(request.body);
        const row = await mutation(() => store.update(request.params.id, input));
        if (!row) throw noteError(404, "note_not_found");
        response.json(row);
    });
    router.delete("/:id", async (request, response) => {
        if (!await mutation(() => store.remove(request.params.id))) throw noteError(404, "note_not_found");
        response.status(204).end();
    });
    router.all(["/", "/:id"], (_request, response) => {
        response.set("Allow", "GET, HEAD, POST, PUT, DELETE").status(405).json({ error: "method_not_allowed" });
    });
    return router;
}
