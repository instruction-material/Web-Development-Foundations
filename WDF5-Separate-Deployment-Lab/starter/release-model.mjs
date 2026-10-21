import { createHash } from "node:crypto";

export const ROLE = "starter";
export const FILE_NAMES = Object.freeze(["index.html", "main.js", "env.js", "serve.mjs"]);
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 5 * MAX_FILE_BYTES;
export function artifactError(code) {
    return Object.assign(new Error(code), { code });
}
export function digestBytes(bytes) {
    // TODO: hash the supplied bytes with SHA-256 and return lowercase hexadecimal.
    throw artifactError("not_implemented_digest");
}
export function assertInventory(expected, actual) {
    // TODO: compare complete inventories by name without changing either input.
    throw artifactError("not_implemented_inventory");
}
function exactKeys(value, keys) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
export function validateManifest(value) {
    if (!exactKeys(value, ["schemaVersion", "role", "files"])
        || value.schemaVersion !== 1 || value.role !== ROLE
        || !Array.isArray(value.files) || value.files.length !== FILE_NAMES.length) {
        throw artifactError("invalid_artifact_manifest");
    }
    const names = new Set();
    let total = 0;
    for (const row of value.files) {
        if (!exactKeys(row, ["name", "bytes", "sha256"])
            || !FILE_NAMES.includes(row.name) || names.has(row.name)
            || !Number.isInteger(row.bytes) || row.bytes < 0 || row.bytes > MAX_FILE_BYTES
            || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)) {
            throw artifactError("invalid_artifact_manifest");
        }
        names.add(row.name);
        total += row.bytes;
    }
    if (total > MAX_TOTAL_BYTES) throw artifactError("artifact_too_large");
    return value;
}
