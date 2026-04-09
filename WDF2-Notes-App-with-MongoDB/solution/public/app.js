const noteForm = document.querySelector("#note-form");
const notesList = document.querySelector("#notes");

function tagList(value) {
	return value.split(",").map(item => item.trim()).filter(Boolean);
}

async function loadNotes() {
	const response = await fetch("/api/notes");
	const notes = await response.json();
	notesList.innerHTML = "";
	
	for (const note of notes) {
		const li = document.createElement("li");
		li.className = "note";
		li.innerHTML = `
			<h3>${note.title}</h3>
			<p>${note.body}</p>
			<small>${(note.tags ?? []).join(", ")}</small>
			<button data-id="${note._id}">Delete</button>
		`;
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
			tags: tagList(String(formData.get("tags") ?? "")),
		}),
	});
	noteForm.reset();
	await loadNotes();
});

notesList?.addEventListener("click", async event => {
	const target = event.target;
	
	if (!(target instanceof HTMLButtonElement)) {
		return;
	}
	
	await fetch(`/api/notes/${target.dataset.id}`, {method: "DELETE"});
	await loadNotes();
});

loadNotes();

