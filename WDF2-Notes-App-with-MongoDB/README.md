# Notes, data models, and recovery

Build and investigate one local notes service through two storage adapters.
The default memory adapter runs without a database. The optional MongoDB adapter
uses the same browser, API, validation, public IDs, and snapshot format.
Use fictional data and one owned service process per learning database.

## Run the maintained source

Use Node.js 24 and the repository's existing npm version and lockfile. From the
repository root, run `npm ci` once when dependencies are missing, then:

```sh
npm run start --workspace=WDF2-Notes-App-with-MongoDB/starter
```

Open `http://127.0.0.1:3001`. The service binds only to loopback. Its one-line JSON
ready record names the actual port; `PORT=0` selects a free port. Stop only the
process started for this lab. Run the reference with the `solution` workspace
instead. The memory service starts with one deterministic fictional note.
Reads and deletes work on the seed; unfinished starter mutations return
`501 not_implemented` until the corresponding functions are completed.

A selected-role ZIP contains all role source, public files, package manifest,
and this reading. Copy its files into the matching role of a complete maintained
checkout, retaining that checkout's root manifest and lockfile. Install from
the root and run the matching workspace. A role ZIP alone does not contain the
monorepo lockfile or execute Express/Mongoose inside a browser-only preview.

## The route through the project

`src/server.js` selects an adapter and owns the listener and shutdown.
`src/app.js` sets the HTTP boundary. `src/routes/notes.js` connects method and
path to storage operations. `src/models/note.js` defines input, saved-record,
snapshot, and Mongoose shapes. `src/store.js` implements the adapters.
`public/app.js` makes requests and renders returned text through DOM text nodes.

The browser is a client, not a database. A form creates a JavaScript value;
`JSON.stringify` serializes it. Express parses the request, the input validator
checks the value, and only then may the adapter change its records. A successful
HTTP response describes the result of that operation. A transport failure can
leave the write outcome uncertain; read the named record or exact-title query
before deciding whether another write is needed.

## Input and stored data

Create and replacement requests contain exactly `title`, `body`, and optional
`tags`. Unknown keys are rejected. Title and body must be strings, trimmed before
checking lengths 1..120 and 1..2000. Tags default to `[]`; at most eight trimmed,
nonempty strings of length 1..24 are accepted, with no duplicates after trimming.
Strings must be well-formed Unicode; lengths use JavaScript UTF-16 code units.
Numbers, null, arrays, empty text, and a string in place of a tags array are invalid.

The browser tag field accepts a JSON array, for example `["example", "sky"]`;
an empty field means `[]`. Editing displays that exact array as JSON, preserving
commas, quotes, and internal line breaks inside a tag. Invalid JSON retains the
form and sends no request. Valid JSON of the wrong shape is rejected by the API.

Each stored record adds a UUID `id`, `createdAt`, and `updatedAt`. An ID identifies
one record independently of its editable title. Timestamps are canonical UTC ISO
strings at the API boundary. Replacement retains the ID and creation time and
keeps the update time nondecreasing, including after a restore or clock rollback. Titles are unique with exact, case-sensitive comparison
in this lab: a second note titled `Orbit` conflicts; `orbit` is a different title.
There are at most 50 notes in the dedicated learning collection.

MongoDB stores the public UUID as `_id`; the adapter translates it to `id` at the
API boundary. The API never accepts a client-supplied ID in a create request.
The Mongoose model validates stored documents, but request validation is still
needed because an ODM may cast values. A unique database index is not a Mongoose
validator: a duplicate-key failure is translated to a stable HTTP conflict.

## Complete the starter

1. Implement `validateNoteInput(input)` in `src/models/note.js`. The supplied
   `inputSchema.safeParse(input)` returns either `{ success: true, data }` or
   `{ success: false, error }`. On failure throw `noteError(400, "invalid_note")`;
   on success return the normalized data. Compare accepted and rejected inputs
   with the contract above, including extra keys and duplicate trimmed tags.
2. Implement `replaceMemoryNote(rows, id, input, now)` in `src/store.js`.
   `rows` is a Map keyed by public ID. If it has no matching record, return null.
   Reject a title already used by a different ID with
   `noteError(409, "note_conflict")`. Make a new record from the old record plus
   a copy of the validated input and an update time equal to the later of `now`
   and the previous update time. Preserve the old ID and
   `createdAt`, store the replacement, and return an independent copy.

`Map.get` reads without inserting; `Map.set` replaces a value at a stable key.
`structuredClone` makes a separate value, so callers cannot change stored tags
by later mutating a returned array. Updating a note and creating another note
are different operations even if their text is identical.

## Observe the API

| Request | Normal result |
| --- | --- |
| `GET /health` | 200, `{ "ok": true, "store": "memory" }` or `mongodb` |
| `GET /api/ready` | 200 `{ "ready": true }`, or 503 with false |
| `GET /api/notes` | 200 array ordered by public ID |
| `GET /api/notes?title=Orbit` | 200 exact-title matches, using the title index in MongoDB |
| `GET /api/notes/:id` | 200 record; unknown valid ID gives 404 `note_not_found` |
| `POST /api/notes` | 201 new record |
| `PUT /api/notes/:id` | 200 complete replacement of editable fields |
| `DELETE /api/notes/:id` | 204 empty body; a repeated delete gives 404 |
| `GET /api/notes/snapshot` | 200 versioned snapshot |

For example, send a fictional request to the owned service:

```sh
curl --include http://127.0.0.1:3001/api/notes \
  --header 'Content-Type: application/json' \
  --data '{"title":"Orbit","body":"A fictional observation.","tags":["example"]}'
```

Retain the returned ID for read, replacement, and deletion. `PUT` is a full
replacement: omitted tags become empty, while omitted title or body is invalid.
The server serializes mutations within this one process. That queue does not
coordinate multiple services or unrelated database clients.

Malformed JSON gives 400 `invalid_json`; invalid note fields give 400
`invalid_note`; malformed IDs give 400 `invalid_id`. A wrong request media type
gives 415 `json_required`, a body over 16 KiB gives 413 `body_too_large`, and a
duplicate title gives 409 `note_conflict`. Reaching the record limit gives 409
`note_limit`. Other storage failures return 503 `storage_unavailable` without
database addresses, note content, or stack traces. Unknown API paths return JSON
404; source files are not public routes. Logs contain event and status only.

## Lifetime, snapshots, and a separate restore target

Memory records survive requests but disappear when that process stops. Restarting
without a seed file resets to the fictional seed; that is a deterministic reset,
not durable persistence. MongoDB records survive an API restart while its database
remains available. Test these lifetimes rather than inferring them from a screen.

Save a snapshot to a new file while the owned service is running:

```sh
curl --fail http://127.0.0.1:3001/api/notes/snapshot --output notes-backup.json
```

The format is `{ "schemaVersion": 1, "notes": [...] }`. It includes exact IDs,
text, tags, and timestamps. It rejects unknown keys, over 50 records, malformed
dates/IDs, duplicate IDs/titles, and normalized-looking values that would change
on import. Seed files are limited to 1 MiB. Version 1 has no implicit migration:
retain a backup and explicitly convert a copy before supporting another version.

From the role directory, start a separate memory process with an absolute backup
path and another owned port:

```sh
PORT=3002 NOTES_SEED_FILE="$PWD/notes-backup.json" node src/server.js
```

Fetch that target's snapshot and compare parsed records, including IDs and
timestamps. Edit only the restored target and show the first process is unchanged.
Keep the original backup. Reading a backup, starting a new target, and checking
integrity are separate steps; a successful start alone does not prove recovery.

## Optional isolated MongoDB adapter

Use an already available local MongoDB service. This project does not install,
start, reset, or drop databases. Name a dedicated database beginning `wdf2_` and
run one API process against it. From the role directory:

```sh
NOTES_ADAPTER=mongodb MONGODB_URI=mongodb://127.0.0.1:27017/wdf2_notes_lab node src/server.js
```

The URI accepts only literal loopback, an explicit port, and the isolated name,
without credentials or query options. An empty collection receives the fictional
seed; a nonempty collection is preserved. Restart the API and verify that a
created record remains. Both adapters must return the same public shapes and
error categories. Queries, connection attempts, and browser requests have bounded
deadlines; stopping MongoDB should produce a bounded failure rather than a hang.

To restore a backup, select a different, empty learning database and also set
`NOTES_SEED_FILE` to the absolute snapshot path. A nonempty target is rejected;
the project never clears it. An older incompatible stored shape is also rejected
with `stored_data_requires_migration`; preserve it and convert a copy explicitly. A connection loss during database import can leave
a partial target, so inspect that target and use a separate empty target for
another attempt rather than assuming atomic restore or overwriting records.

The `_id` index resolves record identity. The unique title index supports
`find({ title })` and rejects title collisions; each write must also maintain
that index. It uses storage and write work in exchange for selective lookup.
This document-shaped note fits a document database. A product needing many shared
relationships, joins, and multi-record transactions may fit a relational model
better; the choice follows access patterns and integrity requirements.

## Checks and further work

From the repository root, run `node --test test/notes-api.test.mjs`. The suite
exercises the completed starter and reference, malformed inputs, stable identity,
conflicts, actual HTTP operations, snapshots, restart/reset, and process cleanup.
An optional `WDF_TEST_MONGOD` executable runs the MongoDB cases in a disposable
owned directory; these tests never use the default database or another service.

For a separate choice project, create an API probe that compares both adapters'
public records and a restart timeline. For a challenge, design and test an
explicit snapshot-version conversion using an untouched original and a separate
restore target. The core reference does not include those added programs.

Reference details: [Mongoose schemas](https://mongoosejs.com/docs/guide.html),
[validation and unique indexes](https://mongoosejs.com/docs/validation.html), and
[connection deadlines](https://mongoosejs.com/docs/connections.html). The installed
Mongoose version remains the one recorded in the maintained package lockfile.
