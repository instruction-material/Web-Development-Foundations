const socket = io();
const identityForm = document.querySelector("#identity-form");
const chatForm = document.querySelector("#chat-form");
const nicknameInput = document.querySelector("#nickname");
const messageInput = document.querySelector("#message");
const messages = document.querySelector("#messages");

function addMessage(value, tone = "default") {
	const li = document.createElement("li");
	li.className = `message ${tone}`;
	li.textContent = value;
	messages.appendChild(li);
}

socket.on("chat:system", value => {
	addMessage(value, "system");
});

socket.on("chat:message", entry => {
	addMessage(`${entry.nickname}: ${entry.value}`, "user");
});

identityForm?.addEventListener("submit", event => {
	event.preventDefault();
	socket.emit("chat:join", nicknameInput.value.trim());
	identityForm.reset();
});

chatForm?.addEventListener("submit", event => {
	event.preventDefault();
	socket.emit("chat:message", messageInput.value.trim());
	chatForm.reset();
});

