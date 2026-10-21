# Realtime chat with a local Socket.IO server

This live-server project follows the local notification state lab and the
backend request/validation work. The local-client folder remains the earlier
fixture exercise; this project connects actual browser clients to one server.

## Start one role

Use Node.js 24 and the complete Web-Development-Foundations checkout. Install
its recorded dependencies from the repository root with npm ci if they are
missing. A role-only source ZIP does not contain the root lockfile.

Run one of these commands from that root:

```sh
npm run start --workspace WDF4-Realtime-Chat-App/starter
```

```sh
npm run start --workspace WDF4-Realtime-Chat-App/solution
```

Open http://127.0.0.1:3003 in two browser windows. Use the same hostname and port
in both. Each role uses that port, so stop the first owned server before
starting the other. The JSON ready event gives the actual loopback host, port
and process ID. Use fictional messages and nicknames.

If that port is occupied, choose an unused port. In macOS/Linux:

```sh
PORT=3013 npm run start --workspace WDF4-Realtime-Chat-App/starter
```

In PowerShell, set the environment value before starting, then remove only
that temporary value after stopping the owned process:

```powershell
$env:PORT = "3013"
npm run start --workspace WDF4-Realtime-Chat-App/starter
Remove-Item Env:PORT
```

Open the port printed by the server. PORT=0 requests an automatically allocated
port for a test; it does not mean that a browser should visit port zero.
Ctrl+C closes the owned Socket.IO clients and HTTP listener. npm run dev in
the selected workspace additionally watches the source. A watcher restart
creates a new process and clears in-memory server state.

## Trace one message

1. Express serves public/index.html and public/chat.js. Socket.IO serves its
   matching browser bundle at /socket.io/socket.io.js. Both come from this
   local process; the browser does not fetch an independently versioned CDN
   client.
2. The browser registers listeners once, then connects. A connection is the
   event channel; it is separate from submitting an HTML form.
3. The form handler prevents navigation and emits chat:message with a string
   plus an acknowledgement callback. The server validates the string.
4. io.emit sends the accepted event to all currently connected clients,
   including its sender. Each client appends one list item using textContent.
   The sender does not append a second optimistic copy.
5. The acknowledgement reports acceptance by this server. The client clears
   only the exact draft it sent, and only after acknowledgement. Text edited
   while that request was pending is retained.

The starter broadcasts anonymous text. The reference adds a nickname form,
server-owned socket.data.nickname, structured message events, timestamps and
join/rename/leave notices. A nickname is a display label, not an authenticated
account. Reconnecting creates fresh server socket state; the reference
re-announces its last acknowledged nickname.

An HTTP request usually has one response. The connected event channel can
receive many updates initiated by other clients. Socket.IO adds its own
protocol, acknowledgements and reconnection behavior; it is not a raw
WebSocket endpoint. Inspect the network panel rather than guessing which
transport is active.

## Input and state contracts

Both servers trim messages, require a string, and accept a resulting length
from 1 through 280 using JavaScript string.length. The reference applies the
same rule with a maximum of 32 for nicknames. Invalid input is not broadcast
and returns an unsuccessful acknowledgement when a callback is supplied.
The input maxlength is a convenience; the server repeats validation because
clients can bypass HTML constraints.

The transport limits each incoming packet to 8 KiB. This is separate from the
message rule and from the client's 100-item rendered-history limit. New
messages discard the oldest displayed item after that limit. The log scrolls
independently of the composer. It follows new entries when already at the
bottom and lets a reader stay above the newest messages while inspecting
earlier entries. The server has
no persisted chat history, replay, delivery receipts or moderation service.
Reloading clears that page's displayed history.

Connection status is visible as Connecting, Connected, Disconnected or
Connection unavailable. Sending is disabled while disconnected or while a
message acknowledgement is pending. An explicit connected check also
prevents a programmatically submitted offline form from buffering an event.
The draft stays editable. Automatic reconnection is bounded; Reconnect starts
another connection attempt.

An acknowledgement timeout does not prove that the server rejected a
message: the server may have broadcast it before the reply was lost. The
client keeps the draft and asks the learner to inspect the conversation
before retrying. It does not silently retry or claim exactly-once delivery.

## Core project and distinct extensions

For the core, run the starter with two clients and trace the message through
form, event, validation, broadcast, text rendering and acknowledgement.
Explain why a duplicate optimistic append would show the sender's message
twice. Check ordinary text, surrounding spaces, blank input, malformed input
and the length boundary. Keep the selected source role, changed files and
observed outcomes together.

Choose one extension:

- Add acknowledged nicknames and join/leave notices while preserving safe
  text rendering. The supplied reference demonstrates this extension.
- Add isolated named rooms and demonstrate that a client outside a room
  receives none of its messages. This is additional work; the reference's
  single shared room does not implement room isolation.

For a challenge, add explicit message IDs and describe how the server could
recognize retries without promising permanent storage or delivery. Define
what survives a reconnection and a server restart before implementing it.
The current reference does not implement that challenge.

## Verify failure and recovery

Keep two clients open. Send a fictional message and confirm that each sees
one copy. In the reference, join with two different fictional nicknames,
rename one, and close its tab; the other tab should see the matching notices.

Send text containing angle brackets and confirm it remains literal text,
without creating an HTML element. Remove HTML maxlength in a disposable
developer-tools experiment and try oversized input; confirm rejection by
the server and preservation of the draft.

Stop only the owned server. Both pages should report loss of connection;
their drafts must remain. Restart the same role on the same port. Reconnect
if needed, then send a new message once. Check for duplicate listeners or
unexpectedly queued messages. Previously displayed items are local page
state; the restarted server has no saved nickname or message history.

Run the portable startup and shutdown checks from the repository root:

```sh
node --test test/realtime-chat-startup.test.mjs
```

These check both native roles, their local browser-client bundle, invalid
ports and release of the listener. They do not replace the two-window browser
and event checks above.

Retain an evidence table with the input, connected state, expected server
decision, actual event in each window, draft state and recovery result.
Compare this live transport with the earlier local-client fixture without
treating either as a replacement for the other.

First-party references: [serving the client](https://socket.io/docs/v4/server-options/#serveclient),
[events and acknowledgements](https://socket.io/docs/v4/emitting-events/),
[offline buffering](https://socket.io/docs/v4/client-offline-behavior/), and
[closing the server](https://socket.io/docs/v4/server-api/#serverclosecallback).
