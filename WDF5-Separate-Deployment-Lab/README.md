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
