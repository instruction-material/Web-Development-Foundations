import express from "express";
import mongoose from "mongoose";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {notesRouter} from "./routes/notes.js";


const app = express();
const port = Number(process.env.PORT ?? 3001);
const mongoUri =
	process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/wdf2_notes";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/notes", notesRouter);

app.get("/api/health", (_request, response) => {
	response.json({
		ok: true,
		database: mongoose.connection.readyState,
	});
});

async function start() {
	await mongoose.connect(mongoUri);
	app.listen(port, () => {
		console.log(`Notes app listening on http://localhost:${port}`);
	});
}

start().catch(error => {
	console.error(error);
	process.exitCode = 1;
});

