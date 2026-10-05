import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/deploy.yml");
const packageLockPath = path.join(root, "package-lock.json");
const workflow = readFileSync(workflowPath, "utf8");

assert.match(workflow, /uses:\s*actions\/setup-node@v6/);
if (!existsSync(packageLockPath)) {
  assert.match(
    workflow,
    /package-manager-cache:\s*false/,
    "setup-node v6 auto package-manager cache must be disabled when no lockfile is shipped",
  );
}
assert.match(workflow, /run:\s*npm install/);
assert.match(workflow, /run:\s*npm test/);
assert.match(workflow, /run:\s*npm run typecheck/);
assert.match(workflow, /run:\s*npm run build/);
assert.match(workflow, /uses:\s*actions\/deploy-pages@v4/);

console.log("PASS GitHub Pages workflow works without an npm lockfile");
