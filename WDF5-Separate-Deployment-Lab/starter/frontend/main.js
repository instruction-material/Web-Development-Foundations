const status = document.querySelector("#status");
const apiBaseUrl = window.__APP_CONFIG__?.apiBaseUrl ?? "http://localhost:4001";

async function loadStatus() {
	const response = await fetch(`${apiBaseUrl}/api/status`);
	const payload = await response.json();
	status.textContent = payload.message;
}

loadStatus().catch(() => {
	status.textContent = "Could not reach the API.";
});

