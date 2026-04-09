import express from "express";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import {createMailer} from "./lib/mailer.js";


const app = express();
const port = Number(process.env.PORT ?? 3002);
const contactEmail = process.env.CONTACT_EMAIL ?? "owner@example.com";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mailer = createMailer();

const contactSchema = z.object({
	name: z.string().trim().min(2).max(80),
	email: z.string().email(),
	message: z.string().trim().min(10).max(2000),
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.post("/api/contact", async (request, response) => {
	const parsed = contactSchema.safeParse(request.body);
	
	if (!parsed.success) {
		return response.status(400).json({
			error: "Invalid contact request",
			details: parsed.error.flatten(),
		});
	}
	
	await mailer.sendMail({
		to: contactEmail,
		from: contactEmail,
		replyTo: parsed.data.email,
		subject: `Booking request from ${parsed.data.name}`,
		text: `${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`,
	});
	
	return response.status(202).json({
		accepted: true,
		preview: "Use SMTP env vars for real delivery.",
	});
});

app.listen(port, () => {
	console.log(`Contact app listening on http://localhost:${port}`);
});

