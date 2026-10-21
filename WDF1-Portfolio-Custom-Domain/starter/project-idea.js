// Return a validation result without reading or changing the DOM.
export function validateProjectIdea(fields) {
    // TODO: accept only string fields; trim the title and goal.
    // TODO: require title length 1..60 and goal length 1..200.
    // TODO: accept only website, game or data as projectType.
    // Failure: { ok: false, errors: { fieldName: "Useful message" } }.
    // Success: { ok: true, value: { projectTitle, projectType, goal } }.
    return {
        ok: false,
        errors: { projectTitle: "Complete the project-idea validation module." },
    };
}
