const socket = io();
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const messages = document.querySelector("#messages");

function addMessage(value) {
	const li = document.createElement("li");
	li.textContent = value;
	messages.appendChild(li);
}

socket.on("chat:message", value => {
	addMessage(value);
});

form?.addEventListener("submit", event => {
	event.preventDefault();
	socket.emit("chat:message", input.value);
	input.value = "";
});

