import express from "express";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMailer} from "./lib/mailer.js";


const app = express();
const port = Number(process.env.PORT ?? 3002);
const contactEmail = process.env.CONTACT_EMAIL ?? "owner@example.com";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mailer = createMailer();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.post("/api/contact", async (request, response) => {
	const {name, email, message} = request.body;
	
	await mailer.sendMail({
		to: contactEmail,
		from: email,
		subject: `New contact message from ${name}`,
		text: message,
	});
	
	response.status(202).json({accepted: true});
});

app.listen(port, () => {
	console.log(`Contact app listening on http://localhost:${port}`);
});

