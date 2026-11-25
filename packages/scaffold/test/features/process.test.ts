import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BIN, givenProject } from "../support/sandbox.ts";

/**
 * Runs the built bin with stdin left open as a pipe (not a terminal). If the
 * CLI ever tried to prompt it would wait forever, so a timeout is a failure.
 */
function spawnCli(cwd: string, args: string[], timeoutMs = 10_000) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [BIN, ...args], {
        cwd,
        env: { ...process.env, CI: "" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new Error(
            `CLI didn't exit within ${timeoutMs}ms (hung on a prompt?)\n${stderr}`,
          ),
        );
      }, timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stderr, stdout });
      });
    },
  );
}

describe("Feature: the built CLI never hangs", () => {
  it("exits with MISSING_INPUT when stdin is an open pipe and no inputs are given", async () => {
    const project = await givenProject();

    const result = await spawnCli(project.root, [
      "generate",
      "component",
      "--json",
    ]);

    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe("MISSING_INPUT");
  });

  it("exits with USAGE for --interactive without a terminal", async () => {
    const project = await givenProject();

    const result = await spawnCli(project.root, [
      "generate",
      "hook",
      "--interactive",
      "--json",
    ]);

    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout).error.code).toBe("USAGE");
  });

  // In-process, Vitest would transpile the plopfile itself, so this only
  // shows up when Node loads it.
  it("explains TypeScript syntax Node can't strip in the plopfile", async () => {
    const project = await givenProject();
    project.write(
      "generators/plopfile.ts",
      `enum Mode { A }
export default async function (plop) {
  await plop.load("@rammio/scaffold");
}
`,
    );

    const result = await spawnCli(project.root, ["list", "--json"]);

    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).error).toMatchObject({
      code: "PLOPFILE_LOAD_FAILED",
      details: { hint: expect.stringContaining("enums") },
    });
  });

  it("generates through the built bin", async () => {
    const project = await givenProject();

    const result = await spawnCli(project.root, [
      "generate",
      "hook",
      "--input",
      "name=useA",
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).files).toHaveLength(2);
    expect(result.stderr).toBe("");
  });
});
