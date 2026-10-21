import { validateProjectIdea } from "./project-idea.js";

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


const ideaForm = document.querySelector("#project-idea-form");
const ideaStatus = document.querySelector("#idea-status");
const ideaSummary = document.querySelector("#idea-summary");

if (ideaForm && ideaStatus && ideaSummary) {
    ideaForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const result = validateProjectIdea(Object.fromEntries(new FormData(ideaForm)));
        if (!result.ok) {
            ideaSummary.replaceChildren();
            ideaStatus.textContent = Object.values(result.errors).join(" ");
            const firstField = Object.keys(result.errors)[0];
            ideaForm.elements.namedItem(firstField)?.focus();
            return;
        }
        ideaSummary.replaceChildren();
        for (const [label, value] of [
            ["Title", result.value.projectTitle],
            ["Type", result.value.projectType],
            ["Goal", result.value.goal],
        ]) {
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = label;
            detail.textContent = value;
            ideaSummary.append(term, detail);
        }
        ideaStatus.textContent = "Draft preview updated.";
    });
    ideaForm.addEventListener("reset", () => {
        ideaSummary.replaceChildren();
        ideaStatus.textContent = "Draft cleared.";
    });
}
