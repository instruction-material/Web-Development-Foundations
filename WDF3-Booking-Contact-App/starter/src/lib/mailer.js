import nodemailer from "nodemailer";


export function createMailer() {
	return nodemailer.createTransport({
		jsonTransport: true,
	});
}

