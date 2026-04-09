const form = document.querySelector("#contact-form");
const status = document.querySelector("#status");

form?.addEventListener("submit", async event => {
	event.preventDefault();
	const formData = new FormData(form);
	const payload = Object.fromEntries(formData.entries());
	
	const response = await fetch("/api/contact", {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify(payload),
	});
	
	status.textContent = response.ok
		? "Message accepted."
		: "Something went wrong.";
});

