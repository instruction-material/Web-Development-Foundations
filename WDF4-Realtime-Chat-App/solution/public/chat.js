const socket = io({ autoConnect: false, reconnectionAttempts: 5 });
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const messages = document.querySelector("#messages");
const status = document.querySelector("#connection-status");
const error = document.querySelector("#chat-error");
const send = form.querySelector('button[type="submit"]');
const reconnect = document.querySelector("#reconnect");
let pending = false;
function controls() {
    send.disabled = !socket.connected || pending;
    reconnect.disabled = socket.connected;
}
function addMessage(value, tone = "default") {
    const follow =
        messages.scrollTop + messages.clientHeight >= messages.scrollHeight - 8;
    const li = document.createElement("li");
    li.className = "message " + tone;
    li.textContent = value;
    messages.appendChild(li);
    while (messages.children.length > 100) messages.firstElementChild.remove();
    if (follow) messages.scrollTop = messages.scrollHeight;
}
socket.on("connect", () => {
    status.textContent = "Connected";
    error.textContent = "";
    controls();
});
socket.on("disconnect", () => {
    status.textContent = "Disconnected";
    controls();
});
socket.on("connect_error", () => {
    status.textContent = "Connection unavailable";
    controls();
});
reconnect.addEventListener("click", () => {
    status.textContent = "Connecting";
    socket.connect();
});
form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!socket.connected || pending) return;
    const draft = input.value;
    const value = draft.trim();
    if (!value || value.length > 280) {
        error.textContent = "Enter a message from 1 to 280 characters.";
        return;
    }
    pending = true;
    error.textContent = "";
    controls();
    socket.timeout(3000).emit("chat:message", value, (failure, result) => {
        pending = false;
        controls();
        if (failure || result?.ok !== true) {
            error.textContent = failure
                ? "The server did not acknowledge this message. Check the conversation before retrying."
                : "The server rejected this message.";
            return;
        }
        if (input.value === draft) input.value = "";
    });
});

const identityForm = document.querySelector("#identity-form");
const nicknameInput = document.querySelector("#nickname");
const join = identityForm.querySelector('button[type="submit"]');
let nickname = "";
let joining = false;
function identityControls() {
    join.disabled = !socket.connected || joining;
}
socket.on("chat:system", (value) => addMessage(value, "system"));
socket.on("chat:message", (entry) => {
    addMessage(entry.nickname + ": " + entry.value, "user");
});
socket.on("connect", () => {
    identityControls();
    if (nickname) socket.emit("chat:join", nickname);
});
socket.on("disconnect", identityControls);
socket.on("connect_error", identityControls);
identityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!socket.connected || joining) return;
    const draft = nicknameInput.value;
    const value = draft.trim();
    if (!value || value.length > 32) {
        error.textContent = "Enter a nickname from 1 to 32 characters.";
        return;
    }
    joining = true;
    identityControls();
    socket.timeout(3000).emit("chat:join", value, (failure, result) => {
        joining = false;
        identityControls();
        if (failure || result?.ok !== true) {
            error.textContent =
                "The nickname was not acknowledged. Check the connection and retry.";
            return;
        }
        nickname = result.nickname;
        error.textContent = "";
        if (nicknameInput.value === draft) nicknameInput.value = "";
    });
});
controls();
identityControls();
socket.connect();
