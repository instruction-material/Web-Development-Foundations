const button = document.querySelector("#action");
const entries = document.querySelector("#entries");

let count = 0;

button.addEventListener("click", () => {
	count += 1;
	const item = document.createElement("li");
	item.textContent = `Entry ${count}: module checkpoint recorded.`;
	entries.append(item);
});
