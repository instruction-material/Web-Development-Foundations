const deploymentList = document.querySelector("#deployment-list");
const domainStatus = document.querySelector("#domain-status");
const year = document.querySelector("#year");

const deploymentChecklist = [
	"Publish the built site to a static host.",
	"Connect the custom domain and verify DNS propagation.",
	"Confirm HTTPS, metadata, and responsive layout in production.",
	"Document rollback steps before changing DNS.",
];

for (const item of deploymentChecklist) {
	const li = document.createElement("li");
	li.textContent = item;
	deploymentList?.appendChild(li);
}

if (domainStatus) {
	domainStatus.textContent =
		"Point your domain to the static host, wait for HTTPS issuance, then run a final content and link audit.";
}

if (year) {
	year.textContent = `Updated ${new Date().getFullYear()}`;
}

