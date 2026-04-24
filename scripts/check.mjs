import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDefaultConfig } from "../src/config/defaults.js";

const roots = [
  path.resolve(process.cwd(), "src"),
  path.resolve(process.cwd(), "helper"),
];

function collectJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) {
    return acc;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, acc);
    } else if (entry.isFile() && (fullPath.endsWith(".js") || fullPath.endsWith(".mjs"))) {
      acc.push(fullPath);
    }
  }
  return acc;
}

const files = roots.flatMap(root => collectJsFiles(root));

for (const file of files) {
  await import(pathToFileURL(file).href);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readTextIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function collectTextFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) {
    return acc;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(fullPath, acc);
    } else if (entry.isFile() && /\.(js|mjs|json|md|ps1|bat|html|css)$/i.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

const config = createDefaultConfig();
const providerIds = config.providers.apiKeyProviders;
assert(providerIds.includes(config.providers.defaultProvider), "defaultProvider must be listed in apiKeyProviders");
providerIds.forEach(providerId => {
  assert(config.providers.presets[providerId], `missing provider preset: ${providerId}`);
  assert(
    Object.prototype.hasOwnProperty.call(config.providers.modelPresets, providerId),
    `missing model presets entry: ${providerId}`,
  );
});

const guiInstaller = path.resolve(process.cwd(), "bin", "install_windows_gui.ps1");
if (fs.existsSync(guiInstaller)) {
  const bytes = fs.readFileSync(guiInstaller);
  assert(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, "GUI installer must keep UTF-8 BOM for Windows PowerShell 5.1");
}

const projectText = collectTextFiles(process.cwd()).map(readTextIfExists).join("\n");

[
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /tvly-[A-Za-z0-9_-]{20,}/,
].forEach(pattern => {
  assert(!pattern.test(projectText), `possible secret matched by ${pattern}`);
});

console.log(`checked ${files.length} modules and project invariants`);
