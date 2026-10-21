import { createHash } from "node:crypto";

export const ROLE = "solution";
export const FILE_NAMES = Object.freeze(["index.html", "main.js", "env.js", "serve.mjs", "styles.css"]);
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 5 * MAX_FILE_BYTES;
export function artifactError(code) {
    return Object.assign(new Error(code), { code });
}
export function digestBytes(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
export function assertInventory(expected, actual) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) {
        throw artifactError("artifact_integrity_mismatch");
    }
    const found = new Map(actual.map(row => [row.name, row]));
    const expectedNames = new Set(expected.map(row => row.name));
    if (found.size !== actual.length || expectedNames.size !== expected.length) {
        throw artifactError("artifact_integrity_mismatch");
    }
    for (const row of expected) {
        const value = found.get(row.name);
        if (!value || value.bytes !== row.bytes || value.sha256 !== row.sha256) {
            throw artifactError("artifact_integrity_mismatch");
        }
    }
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
