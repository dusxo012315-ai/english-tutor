import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// Inspect paths only. Never print environment contents or database records.
let manifests = 0;
const forbidden = new Set();
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspect(path);
    else if (entry.name.endsWith(".nft.json")) {
      manifests++;
      for (const file of JSON.parse(readFileSync(path, "utf8")).files ?? []) {
        const source = relative(
          process.cwd(),
          resolve(dirname(path), file),
        ).replaceAll("\\", "/");
        if (
          /^(data|artifacts|test-results)\//.test(source) ||
          /^\.env(?:\.|$)/.test(source)
        )
          forbidden.add(source);
      }
    }
  }
}
inspect(".next");
if (!manifests || forbidden.size) {
  console.error(
    `Build privacy check failed: ${manifests} manifests, ${forbidden.size} private paths. Do not deploy.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Build privacy check passed: ${manifests} manifests; no user DB, environment files or private artifacts.`,
  );
}
