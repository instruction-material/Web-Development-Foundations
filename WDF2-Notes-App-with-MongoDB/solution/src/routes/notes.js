import {Router} from "express";
import {z} from "zod";
import {Note} from "../models/note.js";


const noteInput = z.object({
	title: z.string().trim().min(1).max(120),
	body: z.string().trim().min(1).max(2000),
	tags: z.array(z.string().trim().min(1).max(24)).default([]),
});

export const notesRouter = Router();

notesRouter.get("/", async (_request, response) => {
	const notes = await Note.find().sort({createdAt: -1}).lean();
	response.json(notes);
});

notesRouter.post("/", async (request, response) => {
	const parsed = noteInput.safeParse(request.body);
	
	if (!parsed.success) {
		return response.status(400).json({
			error: "Invalid note payload",
			details: parsed.error.flatten(),
		});
	}
	
	const note = await Note.create(parsed.data);
	return response.status(201).json(note);
});

notesRouter.delete("/:id", async (request, response) => {
	const deleted = await Note.findByIdAndDelete(request.params.id);
	
	if (!deleted) {
		return response.status(404).json({error: "Note not found"});
	}
	
	return response.status(204).end();
});

