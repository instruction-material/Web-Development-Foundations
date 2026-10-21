# Separate front-end and API processes

Run a static front end and a separate Express API on loopback. Both roles use
fictional status data. No public hosting account, DNS change or credentials
are required for this local exercise.

## Start the reference

Use Node.js 24 and the complete maintained repository. Run `npm ci` from the
repository root when dependencies are missing. Keep the root package manifest
and lockfile; the backend role depends on that workspace graph.

From the repository root, start the API in one terminal:

```sh
npm run start --workspace=WDF5-Separate-Deployment-Lab/solution/backend
```

In a second terminal, start the static front end:

```sh
node WDF5-Separate-Deployment-Lab/solution/frontend/serve.mjs
```

Open `http://127.0.0.1:4173`. The page should report
`Solution API is running. Region: local.` Both processes bind to `127.0.0.1`.
Their JSON ready records report the actual listening ports. Stop each owned
process with Ctrl+C before changing its configuration or switching roles.
The front-end server serves only the named public files; backend source,
package manifests and arbitrary filesystem paths are not public routes.

## Start the starter

First create its public configuration file from the supplied template. From
the repository root:

```sh
cp WDF5-Separate-Deployment-Lab/starter/frontend/env.template.js WDF5-Separate-Deployment-Lab/starter/frontend/env.js
npm run start --workspace=WDF5-Separate-Deployment-Lab/starter/backend
```

In a second terminal:

```sh
node WDF5-Separate-Deployment-Lab/starter/frontend/serve.mjs
```

The starter page should report `Starter API is running.` Keep edits to its
configuration and source in the starter. Compare the independent reference
when investigating the response-status check and the region field.

## Configuration crosses two boundaries

`frontend/env.js` is ordinary JavaScript sent to the browser before `main.js`.
Its `apiBaseUrl` is public configuration, not a place for passwords or secrets.
Editing it changes the URL used on the next page load. The starter template is
not loaded automatically: the copy step creates the file named by the HTML.

`FRONTEND_ORIGIN` is read by the API process at startup. Its default is exactly
`http://127.0.0.1:4173`. A browser origin includes scheme, host and port;
`localhost` and `127.0.0.1` are different host strings. The CORS header must match
the browser page's origin. CORS controls whether browser JavaScript can read a
cross-origin response; it is not authentication or a network firewall.

`PORT` selects the listening port of the process receiving that environment
variable. The API defaults to 4001 and the static server to 4173. `PORT=0`
selects a free port and the ready record gives its actual value. Changing an
API port also requires changing the public API URL; changing a front-end port
also requires restarting the API with the matching `FRONTEND_ORIGIN`.
The reference also reads `REGION` at API startup and returns it from
`GET /api/status`.

## Trace and diagnose the local result

Follow the HTML's script order, the public configuration, the fetch request,
Express's status route and the rendered text. Observe the request and response
in the browser Network panel. Stop only the API while retaining the front-end
process: reloading the page should show its API error. Restart the API and
reload to demonstrate recovery. Change one public URL or allowed origin at a
time, record the browser result, then restore the working configuration.

The supplied Nginx files and deployment notes are examples for a later review.
They are not executed by these commands. A public deployment still requires
an explicit hosting and TLS plan, appropriate service supervision, configuration
review and verification on a learner-owned target. This local startup check does
not establish those operational properties or a production deployment.

## Automated local HTTP checks

From the complete repository root:

```sh
node --test test/separate-deployment-startup.test.mjs
```

The checks start each role on free loopback ports and verify configuration
loading, the default allowed browser origin, public-file boundaries, HTTP
methods, independent front-end availability and API restart recovery. They
stop only their owned processes and remove their temporary copies.

## Files and artifact boundaries

Each role has `backend/` for the API and `frontend/` for the static page.
`release.mjs` builds, checks and restores only the front-end artifact.
`release-model.mjs` contains the role's file list, manifest validator, byte
hash function and inventory comparison. The API stays in its complete
workspace with the root dependency lockfile. Copying browser files does not
copy or install the API's packages.

A front-end artifact contains exactly `index.html`, `main.js`, `env.js` and
`serve.mjs`; the reference also includes `styles.css`. Its private
`artifact-manifest.json` lists each file's name, byte length and SHA-256 digest.
The static server does not serve the manifest or the runner's own source.
Only the explicitly named public routes can be fetched.

The source may contain templates or other working files. The builder copies
only the listed files. The verifier rejects extra or missing artifact files,
subdirectories, symlinks, malformed manifests and changed bytes. Each file is
limited to 1 MiB, the file set to 5 MiB, and the manifest to 16 KiB.

## Complete the starter's release model

The ordinary local startup above works before this task. Artifact commands in
the unfinished starter fail with `not_implemented_digest` or
`not_implemented_inventory` until these two functions are complete:

1. `digestBytes(bytes)` takes the bytes read from a file. Use the supplied
   `createHash` import: create a `sha256` hash, update it with those bytes,
   and return `digest("hex")`. Hash bytes directly rather than converting
   arbitrary file data to a string. The result is 64 lowercase hexadecimal
   characters. An empty file still has a digest.
2. `assertInventory(expected, actual)` compares complete record arrays by
   `name`. Each record contains `name`, integer `bytes` and string `sha256`.
   Require equal lengths, reject duplicate names in either list, and require
   the same byte length and digest for every named file. Record order is
   irrelevant. Use a Map or sorted copies; do not modify either input.
   Throw the supplied `artifactError("artifact_integrity_mismatch")` for a
   difference; return normally only for an exact match. Manifest shape and
   allowed filenames are checked by the supplied validator before comparison.

Read `collect`, `readArtifact` and `writeArtifact` in `release.mjs` to follow
how those functions affect real files. Complete both functions before building.
A failed operation never reports success; it may leave a newly created
incomplete candidate. Inspect it and choose a new output path for a retry.
The tool never overwrites an existing target.

## Build and verify a retained release

With the API running, use a new output directory from the repository root:

```sh
mkdir -p wdf5-releases
node WDF5-Separate-Deployment-Lab/solution/release.mjs build wdf5-releases/solution-a
node WDF5-Separate-Deployment-Lab/solution/release.mjs verify wdf5-releases/solution-a
```

Use the matching `starter` paths and a different target name after completing
its functions. The build copies the saved front-end bytes, writes a version-1
manifest and checks the actual resulting tree. A successful command exits zero
and prints JSON with `ok: true`, role, file count and the manifest's SHA-256.
Errors exit unsuccessfully with an error code. Preserve both command outcome
and observed browser result.

Stop only the original front-end process, retaining the API. Serve the built
artifact on the same front-end port:

```sh
node wdf5-releases/solution-a/serve.mjs
```

Open `http://127.0.0.1:4173` again. This page is being served from the copied
artifact, not the editable source folder. Its API origin and allowed browser
origin must still agree. The front-end artifact uses only Node built-ins;
it does not need the API's dependency tree beside it.

## Verify a bad release and rehearse rollback

Keep release A unchanged. In the editable source `frontend/env.js`, change
`apiBaseUrl` to `http://127.0.0.1:4001/not-a-status-prefix`. Build a new release B:

```sh
node WDF5-Separate-Deployment-Lab/solution/release.mjs build wdf5-releases/solution-b
node WDF5-Separate-Deployment-Lab/solution/release.mjs verify wdf5-releases/solution-b
```

B can pass integrity verification while containing a wrong configuration.
Stop A's front-end process, serve B's `serve.mjs` on the same port and reload.
The page should report an API error, while the static page and the API's real
`/api/status` route remain available. Inspect the failed request path: the
browser requested `/not-a-status-prefix/api/status`. A correct checksum does
not establish correct application behavior.

Restore the retained A bytes into a separate new target:

```sh
node WDF5-Separate-Deployment-Lab/solution/release.mjs restore wdf5-releases/solution-a wdf5-releases/restored-a
node WDF5-Separate-Deployment-Lab/solution/release.mjs verify wdf5-releases/restored-a
```

Stop B's front end and serve `restored-a/serve.mjs`. Reload and verify the healthy
result without restarting the API. Compare A's and restored A's manifest bytes
and digests. The restore copies the validated retained files and original
manifest; it does not rebuild from the currently broken source configuration.
A target inside the source artifact or an already existing target is refused.
Restore the working source configuration separately before making future builds.

As a negative check, change one file in a disposable copy of an artifact and
run `verify` on that copy. Verification must fail. Keep the original A available
for comparison; changing both a file and its manifest can manufacture a new
self-consistent tree and does not establish its origin.

## Integrity, availability and trust

A digest describes particular bytes. The manifest checks file completeness and
byte consistency; it is not a signature or proof of who produced the release.
Verification describes a stable tree at that time. Do not edit an artifact while
checking, copying or running it. Line endings are bytes too, so record checkout
settings when comparing builds from different machines.

Browser acceptance asks a different question: do page, public configuration,
API route and response produce the intended result? API process health also
does not prove that CORS or the browser's URL is correct. Retain the separate
normal, wrong-origin, unavailable-API and rollback observations.

This stateless status API has no user database to restore. The retained front-end
artifact backs up its public files and configuration; it does not back up private
server settings or persistent data added by a later project. A real release plan
must inventory those independently, retain a compatible rollback version and
verify restored data in a separate target. Local manifests here are learning
artifacts, not authenticated production deployment candidates.
