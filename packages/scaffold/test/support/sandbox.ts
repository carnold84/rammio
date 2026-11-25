import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";
import { main } from "../../src/cli/main.ts";
import type { Prompt } from "../../src/cli/plop.ts";

export const PACKAGE_DIR = fileURLToPath(new URL("../../", import.meta.url));
export const REPO_DIR = path.resolve(PACKAGE_DIR, "../..");
export const BIN = path.join(PACKAGE_DIR, "dist/cli/bin.js");

export type RunOptions = {
  /** Answers for the fake prompt, by question name. Unanswered questions take their default. */
  answers?: Record<string, unknown>;
  env?: Record<string, string>;
  /** Whether stdin looks like a terminal. Defaults to false, like agents and CI. */
  tty?: boolean;
};

export type RunResult = {
  code: number;
  /** Parses stdout as the single JSON document `--json` promises. */
  // biome-ignore lint/suspicious/noExplicitAny: tests read whichever output shape the command printed.
  json: () => any;
  /** The names of the questions the fake prompt asked, in order. */
  prompts: string[];
  stderr: string;
  stdout: string;
};

export type Sandbox = {
  exists: (relPath: string) => boolean;
  read: (relPath: string) => string;
  remove: (relPath: string) => void;
  root: string;
  run: (argv: string[], options?: RunOptions) => Promise<RunResult>;
  /** Files under `dir` (default: the whole project, minus node_modules). */
  tree: (dir?: string) => Record<string, string>;
  write: (relPath: string, content: string) => void;
};

/** A fresh temp project with `@rammio/scaffold` linked in, removed after the test. */
export function createSandbox(): Sandbox {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "rammio-scaffold-")),
  );
  onTestFinished(() => rmSync(root, { force: true, recursive: true }));

  mkdirSync(path.join(root, "node_modules/@rammio"), { recursive: true });
  symlinkSync(
    PACKAGE_DIR,
    path.join(root, "node_modules/@rammio/scaffold"),
    "dir",
  );
  symlinkSync(
    path.join(REPO_DIR, "packages/biome-config"),
    path.join(root, "node_modules/@rammio/biome-config"),
    "dir",
  );
  writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "sandbox", private: true, type: "module" }, null, 2)}\n`,
  );

  const write = (relPath: string, content: string) => {
    const file = path.join(root, relPath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  const tree = (dir = ".") => {
    const files: Record<string, string> = {};
    const walk = (current: string) => {
      const absolute = path.join(root, current);
      if (!existsSync(absolute)) return;
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const rel = path.posix.join(current, entry.name);
        if (entry.isDirectory()) walk(rel);
        else
          files[path.posix.normalize(rel)] = readFileSync(
            path.join(root, rel),
            "utf8",
          );
      }
    };
    walk(dir);
    return files;
  };

  const run = async (
    argv: string[],
    options: RunOptions = {},
  ): Promise<RunResult> => {
    let stdout = "";
    let stderr = "";
    const prompts: string[] = [];
    const scripted = options.answers ?? {};
    // Like inquirer's prompt(questions, answers): asks only what isn't answered.
    const prompt = async (
      questions: readonly object[],
      given: Record<string, unknown>,
    ) => {
      const answers = { ...given };
      for (const question of questions as Prompt[]) {
        if (Object.hasOwn(answers, question.name)) continue;
        prompts.push(question.name);
        answers[question.name] = Object.hasOwn(scripted, question.name)
          ? scripted[question.name]
          : typeof question.default === "function"
            ? await question.default(answers)
            : question.default;
      }
      return answers;
    };
    const code = await main(argv, {
      cwd: root,
      env: options.env ?? {},
      prompt,
      stderr: { write: (chunk: string) => (stderr += chunk) },
      stdin: { isTTY: options.tty ?? false },
      stdout: { write: (chunk: string) => (stdout += chunk) },
    });
    return {
      code,
      json: () => JSON.parse(stdout),
      prompts,
      stderr,
      stdout,
    };
  };

  return {
    exists: (relPath) => existsSync(path.join(root, relPath)),
    read: (relPath) => readFileSync(path.join(root, relPath), "utf8"),
    remove: (relPath) => rmSync(path.join(root, relPath), { recursive: true }),
    root,
    run,
    tree,
    write,
  };
}

/** Given an initialised project (a plopfile, no agent rules). */
export async function givenProject(): Promise<Sandbox> {
  const sandbox = createSandbox();
  const result = await sandbox.run(["init", "--no-agents"]);
  if (result.code !== 0) throw new Error(`init failed: ${result.stderr}`);
  return sandbox;
}

/** Runs Biome with @rammio/biome-config over the given project paths. */
export function biomeCheck(
  sandbox: Sandbox,
  paths: string[],
): { code: number; output: string } {
  sandbox.write(
    "biome.json",
    `${JSON.stringify({ extends: ["@rammio/biome-config/biome"], root: true }, null, 2)}\n`,
  );
  const result = spawnSync(
    path.join(REPO_DIR, "node_modules/.bin/biome"),
    ["check", ...paths],
    {
      cwd: sandbox.root,
      encoding: "utf8",
    },
  );
  return {
    code: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}
