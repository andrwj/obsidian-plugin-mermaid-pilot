import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
const pkg = await readJson("package.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json");
assert.match(manifest.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
assert.equal(pkg.version, manifest.version, "Package and manifest versions must match");
assert.equal(versions[manifest.version], manifest.minAppVersion, "versions.json must match the manifest");
for (const key of ["name", "description", "author", "minAppVersion"]) {
  assert.equal(typeof manifest[key], "string");
  assert.ok(manifest[key].length > 0, `${key} must not be empty`);
}
console.log("Plugin metadata checks passed.");
