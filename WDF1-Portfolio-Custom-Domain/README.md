# Portfolio: modules, forms and a static build

This lab continues the HTML, CSS and DOM portfolio with a separate JavaScript
validation module and a local project-idea form. WDF0-WDF2 use the original
four-file edition. This module edition is a new saved project: retain the
earlier files and transfer intended content edits into it.

## Files and roles

Each role has `index.html`, `styles.css`, `main.js`, `project-idea.js` and
`package.json`. HTML supplies landmarks, project cards, labels and native form
constraints. CSS controls layout and focus. `main.js` handles DOM events and
safe rendering; it imports `validateProjectIdea` from `project-idea.js`.
The validator reads values and returns a result without accessing the DOM.

The starter keeps that validator as a deliberate TODO and refuses previews
until it is implemented. The reference implements the same stated contract.
Both keep the original deployment list and year behavior. Compare the
reference after completing and checking the starter.

## Run from the complete repository

Use Node.js 24. From the repository root with its maintained package and
lockfiles, select exactly one role:

```sh
npm ci --workspace WDF1-Portfolio-Custom-Domain/starter
npm run dev --workspace WDF1-Portfolio-Custom-Domain/starter -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`. Stop this process with Ctrl+C. Replace `starter`
with `solution` in those commands to inspect the reference separately, with
the first role stopped. A role-only ZIP omits the root monorepo lockfile;
place its edited files back into the selected complete-repository workspace
before using these commands. Do not replace that root lockfile with a new one.

```sh
node --test test/portfolio-project-idea.test.mjs
npm run build --workspace WDF1-Portfolio-Custom-Domain/starter
npm run preview --workspace WDF1-Portfolio-Custom-Domain/starter -- --host 127.0.0.1 --port 4173 --strictPort
```

The default Node tests check the reference. Run the same contract against the
learner's starter with:

```sh
node test/portfolio-project-idea.test.mjs starter
```

The unfinished starter initially fails the valid-input cases. Complete its
validator and repeat until all five cases pass. Preview serves `dist` at `http://127.0.0.1:4173`;
stop it with Ctrl+C after the browser checks.

## Validation contract

`validateProjectIdea(fields)` returns either
`{ ok: true, value: { projectTitle, projectType, goal } }` or
`{ ok: false, errors: { fieldName: "Useful message" } }`.

- Accept only string fields. Trim surrounding whitespace from title and goal.
- A trimmed title has length 1-60; a trimmed goal has length 1-200. Length uses
  JavaScript string length, the same units as the HTML maxlength controls.
- Type is exactly `website`, `game` or `data`; an unexpected value is refused.
- Validation reports errors without mutating its input or touching the page.
- Valid text is displayed using `textContent`, never interpreted as markup.
- Empty controls receive native browser feedback. A whitespace-only value
  needs the JavaScript check. An invalid result clears an earlier preview,
  announces the errors and focuses its first invalid control.
- A valid submit replaces the previous preview. Clear resets both controls
  and preview. Refresh discards the draft; this project sends no form request.

Try all three types, whitespace-only text, exact limits and values one unit
beyond the limits by calling the validator. In the form, try keyboard-only
submit and reset, repeated submit, a long unbroken word, a Unicode title and
literal `<b>text</b>` as a goal. The last value must appear literally.

## Explain the boundaries

An `export` names a module binding; `import` names the binding used by another
module. The page's `type="module"` entry allows that dependency graph. During
development Vite serves source modules; a build transforms their dependency
graph and writes static output. The module must not be omitted from an export.

Native `required` and `maxlength` constraints help the person using the form.
They do not establish a future API's trust boundary. A later server must
validate again before storage or delivery. The current form only previews
fictional data in the browser.

This lab requires no environment file. In Vite, `VITE_` values are public
client configuration substituted into a build. A database password or SMTP
credential belongs on a server and must never be put in browser source or a
client build variable. Ignoring a file in Git does not remove it from a build
that explicitly reads and publishes its contents.

## Browser and build check

At 390 and 1280 CSS pixels, and separately at 200% zoom, check source heading
order, field labels, keyboard operation, visible focus, long-text wrapping,
status feedback and the absence of horizontal scrolling. Make one original
project section and explain its semantic heading. Inspect Console and Network
before and after a successful build. The locally previewed build must show the
same intended content and form behavior. Public hosting and custom-domain
configuration are later work, not requirements for this local lab.

References: [JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules),
[form validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation),
[Vite environment values](https://vite.dev/guide/env-and-mode).
