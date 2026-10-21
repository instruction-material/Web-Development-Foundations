# Contact requests and a local HTTP service

This lab adds a server boundary after the portfolio and local notification
work. The browser collects a fictional request; Express parses bounded JSON;
a validation module decides whether the data is acceptable; a JSON mail
transport simulates delivery. No SMTP connection or email delivery occurs.
A successful HTTP response proves this local simulation, not inbox arrival.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `public/index.html` | Named controls, native constraints and a live status region. |
| `public/styles.css` | Reflow, readable fields and visible keyboard focus. |
| `public/app.js` | One pending submission, response states, timeout and reset. |
| `src/validation.js` | Pure input validation and normalization. |
| `src/app.js` | HTTP contract, body/request bounds and simulated delivery deadline. |
| `src/lib/mailer.js` | JSON-only transport and deliberate local failure scenarios. |
| `src/server.js` | Loopback listener, readiness record and owned shutdown. |
| `package.json` | Express, Zod and Nodemailer versions and native run commands. |

The browser's constraints improve feedback, but a caller can bypass the form.
The server must check the request independently before it calls delivery.
Validation returns data; it does not mutate the caller's object or send mail.

## Start one role

Use Node.js 24 and npm from the complete maintained repository with its root
`package.json` and `package-lock.json`. From that repository root:

```sh
node --version
npm --version
npm ci --workspace WDF3-Booking-Contact-App/starter
npm run start --workspace WDF3-Booking-Contact-App/starter
```

Open `http://127.0.0.1:3002`. The terminal must first report a `ready` event
with host `127.0.0.1` and the selected port. A valid starter submission returns
`501 not_implemented` until its validation function is completed. It never
pretends that unfinished validation accepted a request. Native HTML constraints
may stop an empty submission before any HTTP request is sent.

For reference review, stop the starter's own terminal with Ctrl+C, replace
`starter` with `solution` in the two npm commands, and repeat. Do not stop an
unrelated process if port 3002 is occupied. Select a free port instead:

```sh
PORT=3003 npm run start --workspace WDF3-Booking-Contact-App/solution
```

In PowerShell set `$env:PORT = "3003"` before the npm command. These environment
variables affect this shell's next process; the app does not automatically load
`.env.example`. That file lists local options and contains no credentials.
A role-only ZIP lacks the monorepo root lockfile. Copy its edited source into
the matching role in a complete maintained checkout and retain that checkout's
workspace/root package manifests and root lockfile before `npm ci`.

## Request and validation contract

`POST /api/contact` accepts `Content-Type: application/json` and exactly:

```json
{
  "name": "Fictional Reader",
  "replyTo": "reader@example.invalid",
  "topic": "project",
  "message": "A fictional project request."
}
```

Reject null, arrays, non-objects and unknown keys. Trim name, reply address and
message. Name has 2–80 characters; reply address has at most 254 characters and
must be a valid email shape; topic is exactly `project` or `lesson`; message
has 10–2000 characters. Lengths use JavaScript UTF-16 code units (`string.length`), as recorded by the maintained dependency lockfile and HTML `maxlength`; one visible symbol can occupy more than one unit. Limits apply after trimming. Do not treat a non-string
as text by coercion. Keep markup-looking message text as text.

Implement `parseContact(input)` in the starter's `src/validation.js`.
For accepted input return `{ ok: true, value }`, where value contains only the
four normalized fields. For rejected input return
`{ ok: false, fields: ["name"] }` with the actual invalid field names.
Use `request` for an invalid object or unknown-key error. Return each field
once. Zod's `strictObject`, string constraints and `safeParse` support this
contract; a deliberate plain-JavaScript implementation is also possible.
Remove the `notImplemented` result only when the contract is implemented.

## HTTP outcomes and resource boundaries

| Status | Body or error code | Meaning |
| --- | --- | --- |
| 202 | `{ "ok": true, "delivery": "simulated" }` | Valid request passed the local JSON transport. |
| 400 | `invalid_contact` and safe `fields` | Parsed JSON failed the field contract. |
| 400 | `invalid_json` | Body is not valid JSON. |
| 404 | `not_found` | No such route or static file. |
| 405 | `method_not_allowed`, `Allow: POST` | Contact endpoint received another method. |
| 413 | `body_too_large` | JSON body exceeded 8192 bytes. |
| 415 | `unsupported_media_type` | Wrong/missing JSON type or unsupported encoding. |
| 429 | `rate_limited`, `Retry-After` seconds | More than six POST attempts in ten seconds. |
| 501 | `not_implemented` | Starter validation remains unfinished. |
| 503 | `delivery_unavailable` | Simulated delivery failed. |
| 504 | `delivery_timeout` | Simulated delivery exceeded 750 ms. |
| 500 | `internal_error` | Unexpected application failure, with no raw exception exposed. |

Error bodies have `{ "ok": false, "error": { "code": "..." } }`; field errors
also contain `error.fields`. Malformed/oversized bodies are rejected before
delivery. The six-attempt budget is shared by this one local process, includes
invalid POST attempts, and resets after ten seconds or a restart. It is an
exercise boundary, not a multi-user abuse-prevention service. Browser controls
prevent accidental double submission, but do not create durable deduplication.
The process retains no contact history or rate-limit map.

`GET /health` returns `{ "ok": true }` independently of the delivery scenario.
It proves this HTTP process answers; it does not prove a provider is available.
The listener accepts at most twenty concurrent connections. Header, body and
keep-alive deadlines bound idle requests. Ctrl+C stops the owned listener and
closes its connections; an unfinished request may be interrupted. Restarting
creates a fresh request budget and no saved messages.

## Core project: implement, trace and recover

1. Before changing code, draw browser → JSON request → parser → validation →
   transport → response → browser status. Mark which steps run in Node and
   which run in the browser. Predict the supplied starter's valid-request result.
2. Implement the validation module. Test the example, surrounding whitespace,
   missing fields, null/array input, wrong types, unknown keys, each length
   boundary, invalid address, and both topic values. Confirm the original object
   is unchanged. Compare with the reference only after an independent attempt.
3. Run the form and inspect the request in developer tools. Confirm status 202,
   its exact safe body, and the visible local-only result. A name such as
   `<b>Reader</b>` must remain text; the app must not execute inserted markup.
4. Send malformed JSON, a body over 8192 bytes and a `text/plain` request from
   a local request client. Record expected and observed status/body before
   comparing. Send seven quick valid POSTs; the seventh must return 429 before
   delivery. Wait ten seconds and show recovery.
5. Stop the service. Set `CONTACT_SCENARIO=fail` for one restart, then
   `CONTACT_SCENARIO=timeout` for another. In POSIX shells prefix the npm
   command; in PowerShell set `$env:CONTACT_SCENARIO = "fail"` or `"timeout"`.
   Compare 503 and 504, retained form values, safe status and successful health.
   Restore `CONTACT_SCENARIO=ok` for the final restart.
6. While a timeout request is pending, use Reset and start a fresh form. Its
   stale response must not replace the fresh status. Stop the service and try
   a browser submission to observe the separate network failure. Restart the
   same role and confirm recovery without reloading away saved source edits.
7. At 390 and 1280 CSS pixels and at 200% browser zoom, check field labels,
   keyboard focus, error focus, status announcements and horizontal reflow.
   Record actual results, then stop the service.

The terminal emits request events with only event name, status and outcome.
Verify that name, address, message, provider errors and stack traces are absent.
Do not replace the safe error response with a raw caught error to debug a fault.

Run the maintained repository's native checks from its root:

```sh
npm test
```

The tests cover the supplied unfinished starter, reference, independently
completed starter, real HTTP errors, delivery cancellation, request limits and
process restart. A green validation-only test does not replace observing the
browser and the real local service.

## Choice: change one contract

Add one documented topic and update the validator, select control and independent
request cases together. Keep all earlier valid/invalid cases working. Explain
why changing the browser select alone cannot extend the API contract.

## Challenge: diagnose from boundaries

Make the browser point to a closed local port while this service remains healthy.
Compare that network failure with a live service's 503 and 504. Restore the
correct same-origin request, demonstrate recovery, and explain which evidence
distinguishes process availability from successful delivery.

The later persistence and deployment units add different responsibilities.
This lab supplies no bookings, stored messages, user accounts or public hosting.
A real email-provider integration is separate optional work after the local
contract, privacy and bounded failure behavior have been reviewed.

References: [Express JSON middleware](https://expressjs.com/en/api/express/),
[Node 24 HTTP server](https://nodejs.org/docs/latest-v24.x/api/http.html),
[Zod API](https://zod.dev/api), [Nodemailer JSON transport](https://nodemailer.com/transports/json).
