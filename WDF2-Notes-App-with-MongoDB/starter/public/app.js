const noteForm = document.querySelector("#note-form");
const notesList = document.querySelector("#notes");

async function loadNotes() {
	const response = await fetch("/api/notes");
	const notes = await response.json();
	notesList.innerHTML = "";
	for (const note of notes) {
		const li = document.createElement("li");
		li.textContent = `${note.title}: ${note.body}`;
		notesList.appendChild(li);
	}
}

noteForm?.addEventListener("submit", async event => {
	event.preventDefault();
	const formData = new FormData(noteForm);
	await fetch("/api/notes", {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({
			title: formData.get("title"),
			body: formData.get("body"),
			tags: [],
		}),
	});
	noteForm.reset();
	await loadNotes();
});

loadNotes();

