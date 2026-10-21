# Notification Views and Asynchronous State

The portfolio used a single page and a form. This lab adds multiple views,
asynchronous data loading and recovery. It uses fictional local JSON data
before the later Socket.IO server exercise. The file server supplies static
files; it does not implement live chat or a continuous event connection.

## Files and startup

Each role contains HTML, CSS, `app.mjs`, `state.mjs` and six JSON data sets.
The shared `serve.mjs` and this reading accompany either role in an IDE ZIP.
The client has no dependency installation or bundle step. Use Node.js 24.

From the complete source repository:

```sh
node WDF4-Realtime-Chat-App/local-client/serve.mjs starter 4174
```

Open `http://127.0.0.1:4174`. Replace `starter` with `solution` to inspect the
reference after stopping the first server with Ctrl+C. A port collision must
fail; stop only this exercise's process or choose another unused port. From
an extracted IDE ZIP's project folder, run `node serve.mjs` instead. Keep
every imported file together. Directly opening HTML with a file URL does
not reproduce HTTP fetch behavior.

The server listens only on loopback and serves the named lab files. Public
hosting, an account, a chat service and an API are not required for this unit.

## Separate data, state and the page

`state.mjs` owns the data contract and pure functions. A pure function returns
a value from its arguments without accessing the DOM or modifying its input.
`app.mjs` owns browser events, fetch, request cancellation, URL fragments and
DOM rendering. HTML supplies semantic navigation and native controls; CSS
controls wrapping, spacing and visible focus. There is no framework required
to establish these boundaries.

`createState()` gives each attempt its own arrays, current phase, selected
view, last accepted sequence and rejection counts. `normalizeEvent(value)`
returns a new valid event or `null`. `applyEvents(current, incoming)` returns
a new state; `visibleEntries(state)` chooses records for the selected view.
Changing a view must not discard records or fetch the same data again.

## Event and batch contract

An event has this shape:

```json
{ "id": "e1", "sequence": 1, "type": "message", "text": "Workshop opens at 4:00." }
```

- `id` is 1-32 ASCII letters, digits or hyphens.
- `sequence` is an integer from 0 through 1000000.
- `type` is exactly `message` or `status`.
- `text` is a string; trim its ends, then require length 1-160 in JavaScript
  string-length units. Keep Unicode and literal markup as text data.
- Refuse a malformed event without changing the input. Unknown fields are
  ignored; arrays, null and wrong field types are not events.
- A batch is an array of at most 100 events. Refuse a wrong-shaped or larger
  batch with an error; an empty array is valid.

For each event, normalize first. Count invalid records as rejected. For a
valid record, check its ID against the recent ID window; count a match as a
duplicate. Then reject a sequence at or below the last accepted sequence.
Only an accepted event advances that sequence, enters history and adds an ID.
Keep the last ten entries and last 100 accepted IDs. This bounded ID window
does not promise permanent deduplication across arbitrary future loads.
Each Load starts a new batch and clears the previous history and counts.

The state becomes `connected` when retained history is nonempty and `empty`
otherwise. Here `connected` means that local fixture loading succeeded; it
does not claim that a live Socket.IO connection exists.

## Predict the supplied cases

| Data set | Expected result after loading the reference |
| --- | --- |
| Workshop | e1 and e2; one duplicate and one rejected record. |
| Empty | Empty state, zero entries. |
| Invalid structure | Error: JSON is valid but is not an event array. |
| Malformed JSON | Error before the state reducer receives a batch. |
| History limit | Last ten of fifteen valid records: e6 through e15. |
| Delayed events | e2 then e3; late e1 rejected, repeated e2 counted once. |

Order is a contract choice. This model refuses older sequences instead of
inserting or sorting them. A different application could buffer and reorder;
that would require its own rules for gaps, waiting, duplicates and limits.

## Asynchronous loading and recovery

An async function pauses at `await` while the browser can process other work.
Load first renders `loading`, then fetches the selected JSON. Check HTTP
success before parsing JSON. A bad HTTP response, parse failure or invalid
batch becomes `error`. A successful reducer result becomes connected/empty.

Disconnect aborts the pending local request and sets the model to
`disconnected`. Reconnect uses `reconnecting` while fetching a fresh batch.
These controls simulate transport transitions for the local lesson. Reset
aborts pending work, clears data and counters and returns to Ready and All.

Cancellation and result ownership are distinct. An AbortController requests
cancellation; an increasing request ID also prevents an older response from
replacing newer state if it finishes late. Predict Load followed immediately
by Reset: the old result must not repopulate the page. Handle an obsolete
request's rejection without turning a newer Ready state into Error.

## Views, rendering and accessibility

All, Messages and Status use URL fragments. A fragment change triggers the
hashchange listener and selects a view without requesting a new document.
An unknown fragment falls back to All. The current link exposes aria-current;
filtering keeps the underlying event history and counts.

Render event text with `textContent`, never `innerHTML`. A goal string such as
`<b>literal text</b>` must appear literally and must not create an element.
The status region announces a state change, while the list is not a second
live region announcing every item. Rendering must not move keyboard focus. Unavailable actions use aria-disabled
with guarded handlers, retaining focus and preventing another action while
busy; the ARIA attribute alone does not block a click.

Use keyboard and pointer to operate all controls and navigation. Check visible
focus, source order, long-word wrapping, 390/1280-pixel widths and 200% zoom.
No animation is needed, so reduced-motion preferences must not remove any
functionality. Check an empty filtered view independently of an empty batch.

## Core project and contract checks

Implement the two TODO functions in the starter's `state.mjs`. Keep the
supplied browser wiring, event contract, history/ID caps and fixture cases.
Before each run, predict the phase, visible IDs and counts; then record the
observed result and any correction. Explain which code handles a bad HTTP
response, invalid JSON, a malformed event and an out-of-order valid event.

From the complete repository, the default tests check the reference:

```sh
node --test test/notification-state.test.mjs
```

Use the same checks against the completed learner starter:

```sh
node test/notification-state.test.mjs starter
```

The initial starter deliberately fails the missing-function checks. Complete
it, repeat the checks, then verify all six data sets, each view, Disconnect,
Reconnect and Reset in the browser. Refresh must return a fresh Ready state.
No data is saved by this lab. Saving code in the course IDE preserves source,
not a running page's transient notification state.

After the required work, choose one additional view or add one fixture that
probes the documented limits. A view needs a navigation link, a selectedView
route and a visibleEntries filter. For an extra fixture, add its JSON file,
its filename to the files set in serve.mjs and a matching Data set option;
keep the six baseline cases unchanged. The separate live-chat source remains a later
exercise after server validation and lifecycle boundaries are taught.

References: [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch),
[AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort),
[hashchange](https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event),
[Node.js HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html),
[button focus and unavailable actions](https://www.w3.org/WAI/ARIA/apg/patterns/button/).
