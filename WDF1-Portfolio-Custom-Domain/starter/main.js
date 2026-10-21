import { validateProjectIdea } from "./project-idea.js";

const deploymentList = document.querySelector("#deployment-list");
const year = document.querySelector("#year");

const deploymentChecklist = [
    "Choose a static host such as Vercel or Netlify.",
    "Add your production domain and DNS records.",
    "Verify that links, images, and metadata still work after deployment.",
];

for (const item of deploymentChecklist) {
    const li = document.createElement("li");
    li.textContent = item;
    deploymentList?.appendChild(li);
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
