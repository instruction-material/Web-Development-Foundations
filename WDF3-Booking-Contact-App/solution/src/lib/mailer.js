import nodemailer from "nodemailer";


export function createMailer() {
	if (process.env.SMTP_HOST) {
		return nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: Number(process.env.SMTP_PORT ?? 587),
			secure: false,
			auth: {
				user: process.env.SMTP_USER,
				pass: process.env.SMTP_PASS,
			},
		});
	}
	
	return nodemailer.createTransport({jsonTransport: true});
}

