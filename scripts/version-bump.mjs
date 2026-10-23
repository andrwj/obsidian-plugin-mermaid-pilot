import { readFile, writeFile } from "node:fs/promises";

const readJson = async (name) => JSON.parse(await readFile(name, "utf8"));
const pkg = await readJson("package.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json");
manifest.version = pkg.version;
versions[pkg.version] = manifest.minAppVersion;
await writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile("versions.json", `${JSON.stringify(versions, null, 2)}\n`);
