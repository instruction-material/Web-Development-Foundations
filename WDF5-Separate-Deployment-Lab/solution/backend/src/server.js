import cors from "cors";
import express from "express";


const app = express();
const port = Number(process.env.PORT ?? 4001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "https://www.example.com";
const region = process.env.REGION ?? "local";

app.use(cors({origin: frontendOrigin}));

app.get("/api/status", (_request, response) => {
	response.json({
		message: "Solution API is running.",
		region,
	});
});

app.get("/api/health", (_request, response) => {
	response.json({ok: true});
});

app.listen(port, () => {
	console.log(`API listening on http://localhost:${port}`);
});

