const form = document.querySelector("#contact-form");
const status = document.querySelector("#status");
const submit = form.querySelector('[type="submit"]');
const messages = {
    invalid_contact: "Check the highlighted fields.",
    invalid_json: "The request could not be read. Reset the form and try again.",
    unsupported_media_type: "The request must use JSON.",
    body_too_large: "The request is too large.",
    rate_limited: "Too many attempts. Wait ten seconds, then try again.",
    delivery_timeout: "The local delivery test timed out. Keep the form and try again.",
    delivery_unavailable: "The local delivery test is unavailable. Keep the form and try again.",
    not_implemented: "Complete the contact validation module.",
};
let generation = 0;
let controller;
let busy = false;

function show(text, tone = "neutral") {
    status.textContent = text;
    status.dataset.tone = tone;
}
form.addEventListener("reset", () => {
    generation++;
    controller?.abort();
    busy = false;
    submit.disabled = false;
    form.removeAttribute("aria-busy");
    show("");
});
form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const current = ++generation;
    controller = new AbortController();
    const active = controller;
    busy = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    show("Submitting...");
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        active.abort();
    }, 2000);
    try {
        const response = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form))),
            signal: active.signal,
        });
        let data;
        try {
            data = await response.json();
        } catch {
            if (current !== generation) return;
            show("The server response could not be read. Keep the form and try again.", "error");
            status.focus();
            return;
        }
        if (current !== generation) return;
        if (response.status === 202 && data?.ok === true && data?.delivery === "simulated") {
            show("Recorded locally. No email was sent.", "success");
        } else {
            show(messages[data?.error?.code] ?? "The request failed. Keep the form and try again.", "error");
            const field = data?.error?.fields?.find(name =>
                ["name", "replyTo", "topic", "message"].includes(name));
            (field ? form.elements.namedItem(field) : status).focus();
        }
    } catch {
        if (current !== generation) return;
        show(timedOut ? "The server did not respond in time. Keep the form and try again."
            : "The server could not be reached. Keep the form and try again.", "error");
        status.focus();
    } finally {
        clearTimeout(timer);
        if (current === generation) {
            busy = false;
            submit.disabled = false;
            form.removeAttribute("aria-busy");
        }
    }
});
