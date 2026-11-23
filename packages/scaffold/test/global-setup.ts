import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("../", import.meta.url));

export function setup(): void {
  rmSync(new URL("../dist", import.meta.url), { force: true, recursive: true });
  execFileSync(
    fileURLToPath(new URL("../node_modules/.bin/tsc", import.meta.url)),
    ["-p", "tsconfig.build.json"],
    { cwd: packageDir, stdio: "inherit" },
  );
}
