import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, FILE_NAMES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, artifactError, digestBytes, assertInventory, validateManifest } from "./release-model.mjs";

const manifestName = "artifact-manifest.json";
const frontend = fileURLToPath(new URL("./frontend/", import.meta.url));
function within(parent, child) {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}
async function directory(input) {
    const full = path.resolve(input);
    if (!(await lstat(full)).isDirectory()) throw artifactError("ordinary_directory_required");
    return realpath(full);
}
async function newTarget(input, forbidden) {
    const full = path.resolve(input);
    const parent = await realpath(path.dirname(full));
    const target = path.join(parent, path.basename(full));
    if (within(forbidden, target)) throw artifactError("independent_target_required");
    try {
        await lstat(target);
        throw artifactError("target_already_exists");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    return target;
}
async function bytesAt(root, name, limit = MAX_FILE_BYTES) {
    const full = path.join(root, name);
    const info = await lstat(full);
    if (!info.isFile()) throw artifactError("ordinary_file_required");
    if (info.size > limit) throw artifactError("artifact_too_large");
    const bytes = await readFile(full);
    if (bytes.length > limit) throw artifactError("artifact_too_large");
    return bytes;
}
async function collect(root) {
    const files = new Map();
    const rows = [];
    let total = 0;
    for (const name of [...FILE_NAMES].sort()) {
        const bytes = await bytesAt(root, name);
        total += bytes.length;
        if (total > MAX_TOTAL_BYTES) throw artifactError("artifact_too_large");
        files.set(name, bytes);
        rows.push({ name, bytes: bytes.length, sha256: digestBytes(bytes) });
    }
    return { files, rows };
}
async function readArtifact(input) {
    const root = await directory(input);
    const entries = await readdir(root, { withFileTypes: true });
    const expectedNames = [...FILE_NAMES, manifestName].sort();
    if (entries.some(entry => !entry.isFile())
        || JSON.stringify(entries.map(entry => entry.name).sort()) !== JSON.stringify(expectedNames)) {
        throw artifactError("unexpected_artifact_entries");
    }
    const manifestBytes = await bytesAt(root, manifestName, 16 * 1024);
    let manifest;
    try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
    catch { throw artifactError("invalid_artifact_manifest"); }
    validateManifest(manifest);
    const actual = await collect(root);
    assertInventory(manifest.files, actual.rows);
    return { root, manifest, manifestBytes, files: actual.files };
}
async function writeArtifact(target, files, manifestBytes) {
    await mkdir(target);
    for (const [name, bytes] of files) {
        await writeFile(path.join(target, name), bytes, { flag: "wx" });
    }
    await writeFile(path.join(target, manifestName), manifestBytes, { flag: "wx" });
}

try {
    const [action, first, second, ...extra] = process.argv.slice(2);
    if (!["build", "verify", "restore"].includes(action) || !first || first.startsWith("-")
        || extra.length || (action === "restore" ? !second || second.startsWith("-") : second !== undefined)) {
        throw artifactError("usage: node release.mjs build TARGET | verify ARTIFACT | restore ARTIFACT NEW_TARGET");
    }
    let result;
    if (action === "build") {
        const source = await directory(frontend);
        const target = await newTarget(first, source);
        const collected = await collect(source);
        const manifest = validateManifest({ schemaVersion: 1, role: ROLE, files: collected.rows });
        const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
        await writeArtifact(target, collected.files, manifestBytes);
        result = await readArtifact(target);
    } else if (action === "verify") {
        result = await readArtifact(first);
    } else {
        const source = await readArtifact(first);
        const target = await newTarget(second, source.root);
        await writeArtifact(target, source.files, source.manifestBytes);
        result = await readArtifact(target);
    }
    console.log(JSON.stringify({ ok: true, action, role: ROLE, directory: result.root, files: result.manifest.files.length, manifestSHA256: digestBytes(result.manifestBytes) }));
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.code ?? error.message }));
    process.exitCode = 1;
}
