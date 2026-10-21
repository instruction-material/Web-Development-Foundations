import assert from "node:assert/strict";
import test from "node:test";
const role = process.argv[2] ?? "solution";
if (!["starter", "solution"].includes(role)) throw new Error("Choose starter or solution");
const { validateProjectIdea } = await import(
    new URL("../WDF1-Portfolio-Custom-Domain/" + role + "/project-idea.js", import.meta.url)
);

const valid = { projectTitle: "  Orbit game  ", projectType: "game", goal: "  Explain one orbit.  " };

test(role + " trims values and leaves input unchanged", () => {
    const before = structuredClone(valid);
    assert.deepEqual(validateProjectIdea(valid), {
        ok: true,
        value: { projectTitle: "Orbit game", projectType: "game", goal: "Explain one orbit." },
    });
    assert.deepEqual(valid, before);
});

test(role + " accepts each type and inclusive title/goal limits", () => {
    for (const projectType of ["website", "game", "data"]) {
        for (const size of [1, 60]) {
            assert.equal(validateProjectIdea({ ...valid, projectType, projectTitle: "x".repeat(size), goal: "y".repeat(200) }).ok, true);
        }
    }
});

test(role + " reports all whitespace, type and length failures", () => {
    assert.deepEqual(Object.keys(validateProjectIdea({ projectTitle: "  ", projectType: "other", goal: "\n" }).errors), ["projectTitle", "projectType", "goal"]);
    assert.equal(validateProjectIdea({ ...valid, projectTitle: "x".repeat(61) }).ok, false);
    assert.equal(validateProjectIdea({ ...valid, goal: "x".repeat(201) }).ok, false);
});

test(role + " refuses absent and non-string fields without coercion", () => {
    for (const fields of [null, undefined, [], 42, {}, { projectTitle: 12, projectType: "website", goal: {} }]) {
        assert.equal(validateProjectIdea(fields).ok, false);
    }
});

test(role + " preserves Unicode and markup as text data", () => {
    const value = { projectTitle: "雪の星", projectType: "data", goal: "<b>text</b>" };
    assert.deepEqual(validateProjectIdea(value), { ok: true, value });
});
