# Portfolio files, requests and a local build

This is the four-file portfolio for WDF0-WDF2. The later
[modules and form exercise](../README.md) is a separate project.

## Files and behavior

Each role contains `index.html`, `styles.css`, `main.js` and `package.json`.
HTML supplies the heading, project cards, deployment-list element and year
element. CSS supplies the layout. The module script reads the checklist array,
creates one list item per string and writes the current year as text.

The starter is a working page to customize and debug. It has no intentionally
missing function. The reference shows an alternative completed page and a
longer checklist. A live domain and public hosting are not needed for this lab.

## Start one role

Use Node.js 24 and the complete repository with its maintained root
`package.json` and `package-lock.json`. From that repository root:

```sh
npm ci --workspace WDF1-Portfolio-Custom-Domain/basics/starter
npm run dev --workspace WDF1-Portfolio-Custom-Domain/basics/starter -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`. A local server supplies the document and its CSS
and JavaScript requests. Opening a retained browser tab does not prove that
server is still running. Stop this exercise's process with Ctrl+C when done.
Use `solution` in place of `starter` to inspect the reference, stopping the
first role before starting the second on the same port.

## Trace, change and diagnose

1. In Network, inspect the document, stylesheet and script requests. Record
   their URL, status and content type. Trace the HTML script tag to `main.js`.
2. Find `#deployment-list` and `#year` in HTML and JavaScript. Predict the
   list and year, then compare the rendered DOM.
3. Change one checklist string and one project card in the saved source.
   Reload to verify them. Compare this with an unsaved Elements-panel edit,
   which is lost on reload.
4. Temporarily change the list element's HTML ID. The script's optional
   chaining can leave an empty list without throwing. Restore the ID.
5. Temporarily change `createElement` to `createElementX`. Inspect the
   resulting Console error and whether the later year update runs. Restore
   the method and verify a fresh load.
6. At 390 and 1280 CSS pixels, and at 200% zoom, check heading order, keyboard
   access, visible focus, long text and horizontal scrolling.

A relative CSS URL is resolved against the document URL. A call such as
`fetch('/api/notes')` would request a path at this origin; it does not create
an API handler or database. Distinguish the observed static requests from a
later proposed server feature.

## Save, export and build

Keep this saved project through WDF0-WDF2. The site ZIP contains the selected
role's four files and this reading, not the root monorepo lockfile. Copy its
edited role files back into the matching complete-repository workspace,
retaining the maintained root package and lockfiles. An older archive with
the earlier workspace name needs the current workspace's `package.json`;
transfer its HTML, CSS and JavaScript while keeping that current manifest.

Review the source diff and record the intended change before committing.
A useful record includes the source revision, terminal directory, versions,
command, observed URL/result and one diagnosed failure.

```sh
npm run build --workspace WDF1-Portfolio-Custom-Domain/basics/starter
npm run preview --workspace WDF1-Portfolio-Custom-Domain/basics/starter -- --host 127.0.0.1 --port 4173 --strictPort
```

Inspect `http://127.0.0.1:4173` and repeat the content, Console, Network and
layout checks. Stop the preview with Ctrl+C. Saved source, generated `dist`
and a served page are distinct: an old build does not acquire later source
edits until it is rebuilt. Public deployment is separate later work.
