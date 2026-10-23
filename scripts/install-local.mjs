import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const vault = path.resolve(process.env.OBSIDIAN_VAULT ?? path.join(homedir(), "ObsidianVault"));
const config = path.join(vault, ".obsidian");
if (!(await stat(config)).isDirectory()) throw new Error(`Obsidian config directory not found: ${config}`);
const destination = path.join(config, "plugins", manifest.id);
await mkdir(destination, { recursive: true });
for (const name of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(path.join(root, name), path.join(destination, name));
}
console.log(`Installed ${manifest.name} to ${destination}`);
console.log("Enable or reload the plugin in Obsidian. Existing settings are preserved.");
