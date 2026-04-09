const form = document.querySelector("#contact-form");
const status = document.querySelector("#status");

function setStatus(message, tone = "neutral") {
	status.textContent = message;
	status.dataset.tone = tone;
}

form?.addEventListener("submit", async event => {
	event.preventDefault();
	const formData = new FormData(form);
	const payload = Object.fromEntries(formData.entries());
	
	setStatus("Sending...", "neutral");
	
	const response = await fetch("/api/contact", {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify(payload),
	});
	
	if (!response.ok) {
		setStatus("Please check the form fields and try again.", "error");
		return;
	}
	
	form.reset();
	setStatus("Request accepted. Review SMTP settings before production launch.", "success");
});

