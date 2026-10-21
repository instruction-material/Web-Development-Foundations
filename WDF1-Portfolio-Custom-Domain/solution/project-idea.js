const projectTypes = new Set(["website", "game", "data"]);

export function validateProjectIdea(fields) {
    const source = fields && typeof fields === "object" && !Array.isArray(fields)
        ? fields
        : {};
    const projectTitle = typeof source.projectTitle === "string"
        ? source.projectTitle.trim()
        : "";
    const projectType = typeof source.projectType === "string"
        ? source.projectType
        : "";
    const goal = typeof source.goal === "string" ? source.goal.trim() : "";
    const errors = {};
    if (projectTitle.length < 1 || projectTitle.length > 60) {
        errors.projectTitle = "Enter a project title of 1 to 60 characters.";
    }
    if (!projectTypes.has(projectType)) {
        errors.projectType = "Choose Website, Game or Data story.";
    }
    if (goal.length < 1 || goal.length > 200) {
        errors.goal = "Enter a goal of 1 to 200 characters.";
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value: { projectTitle, projectType, goal } };
}
