import assert from "node:assert/strict";
import test from "node:test";
import { validateProjectIdea } from "../WDF1-Portfolio-Custom-Domain/solution/project-idea.js";
import { validateProjectIdea as starterValidation } from "../WDF1-Portfolio-Custom-Domain/starter/project-idea.js";

const valid = { projectTitle: "  Orbit game  ", projectType: "game", goal: "  Explain one orbit.  " };

test("reference trims values and leaves input unchanged", () => {
    const before = structuredClone(valid);
    assert.deepEqual(validateProjectIdea(valid), {
        ok: true,
        value: { projectTitle: "Orbit game", projectType: "game", goal: "Explain one orbit." },
    });
    assert.deepEqual(valid, before);
});

test("reference accepts each type and inclusive title/goal limits", () => {
    for (const projectType of ["website", "game", "data"]) {
        for (const size of [1, 60]) {
            assert.equal(validateProjectIdea({ ...valid, projectType, projectTitle: "x".repeat(size), goal: "y".repeat(200) }).ok, true);
        }
    }
});

test("reference reports all whitespace, type and length failures", () => {
    assert.deepEqual(Object.keys(validateProjectIdea({ projectTitle: "  ", projectType: "other", goal: "\n" }).errors), ["projectTitle", "projectType", "goal"]);
    assert.equal(validateProjectIdea({ ...valid, projectTitle: "x".repeat(61) }).ok, false);
    assert.equal(validateProjectIdea({ ...valid, goal: "x".repeat(201) }).ok, false);
});

test("reference refuses absent and non-string fields without coercion", () => {
    for (const fields of [null, undefined, [], 42, {}, { projectTitle: 12, projectType: "website", goal: {} }]) {
        assert.equal(validateProjectIdea(fields).ok, false);
    }
});

test("reference preserves Unicode and markup as text data", () => {
    const value = { projectTitle: "雪の星", projectType: "data", goal: "<b>text</b>" };
    assert.deepEqual(validateProjectIdea(value), { ok: true, value });
});

test("starter stays an explicit exercise rather than silently accepting data", () => {
    assert.equal(starterValidation(valid).ok, false);
    assert.match(starterValidation(valid).errors.projectTitle, /Complete/);
});
