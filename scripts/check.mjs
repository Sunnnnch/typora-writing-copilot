import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

console.log(`checked ${files.length} modules`);
