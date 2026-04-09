import {Router} from "express";
import {Note} from "../models/note.js";


export const notesRouter = Router();

notesRouter.get("/", async (_request, response) => {
	const notes = await Note.find().sort({createdAt: -1}).lean();
	response.json(notes);
});

notesRouter.post("/", async (request, response) => {
	const note = await Note.create(request.body);
	response.status(201).json(note);
});

