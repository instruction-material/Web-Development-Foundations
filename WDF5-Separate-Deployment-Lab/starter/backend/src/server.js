import cors from "cors";
import express from "express";


const app = express();
const port = Number(process.env.PORT ?? 4001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4173";

app.use(cors({origin: frontendOrigin}));

app.get("/api/status", (_request, response) => {
	response.json({message: "Starter API is running."});
});

app.listen(port, () => {
	console.log(`API listening on http://localhost:${port}`);
});

