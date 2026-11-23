import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodePlop, { type NodePlopAPI, type PlopGenerator } from "node-plop";
import {
  CliError,
  errorMessage,
  type FileResult,
  type GeneratorInfo,
  type InputInfo,
} from "./output.ts";

export type Answers = Record<string, unknown>;

/** The parts of an inquirer question the CLI reads. */
export type Prompt = {
  choices?: unknown;
  default?: unknown;
  filter?: (value: unknown, answers: Answers) => unknown;
  message?: unknown;
  name: string;
  type?: string;
  validate?: (value: unknown, answers: Answers) => unknown;
  when?: unknown;
};

const PLOPFILES = ["generators/plopfile.ts", "generators/plopfile.js"];

// Without a project plopfile, the package's own entry runs as the plopfile.
// (.ts when the CLI runs from source in tests, .js when built.)
const PACKAGE_ENTRY = fileURLToPath(
  new URL(
    `../index${path.extname(fileURLToPath(import.meta.url))}`,
    import.meta.url,
  ),
);

export async function openPlop(root: string): Promise<NodePlopAPI> {
  const local = PLOPFILES.map((file) => path.join(root, file)).find(existsSync);
  const plopfile = local ?? PACKAGE_ENTRY;
  try {
    return await nodePlop(plopfile, { destBasePath: root, force: false });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    throw new CliError(
      "PLOPFILE_LOAD_FAILED",
      `Couldn't load ${local ? toPosix(path.relative(root, local)) : "the built-in generators"}: ${errorMessage(error)}`,
      code === "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX"
        ? {
            hint: "Node.js (22.18+) runs .ts plopfiles by stripping types, so it can't run enums, namespaces or parameter properties.",
          }
        : {},
    );
  }
}

export function getGenerator(plop: NodePlopAPI, name: string): PlopGenerator {
  const names = plop.getGeneratorList().map((g) => g.name);
  if (!names.includes(name)) {
    throw new CliError(
      "UNKNOWN_GENERATOR",
      `There's no generator called "${name}". Generators: ${names.join(", ")}.`,
      { generators: names },
    );
  }
  return plop.getGenerator(name);
}

/** The generator's prompts, or null when they're a function. */
export function promptsOf(generator: PlopGenerator): Prompt[] | null {
  return Array.isArray(generator.prompts)
    ? (generator.prompts as unknown as Prompt[])
    : null;
}

export function describeGenerator(
  name: string,
  generator: PlopGenerator,
): GeneratorInfo {
  return {
    description: generator.description ?? "",
    inputs: promptsOf(generator)?.map(describeInput) ?? null,
    name,
  };
}

function describeInput(prompt: Prompt): InputInfo {
  const info: InputInfo = {
    name: prompt.name,
    required: prompt.default === undefined,
    type: valueType(prompt),
  };
  if (typeof prompt.message === "string") info.message = prompt.message;
  if (prompt.default !== undefined && typeof prompt.default !== "function") {
    info.default = prompt.default;
  }
  const choices = choicesOf(prompt);
  if (choices) info.choices = choices;
  return info;
}

function valueType(prompt: Prompt): InputInfo["type"] {
  if (prompt.type === "confirm") return "boolean";
  if (prompt.type === "number") return "number";
  if (prompt.type === "checkbox") return "array";
  return "string";
}

function choicesOf(prompt: Prompt): unknown[] | undefined {
  if (!Array.isArray(prompt.choices)) return undefined;
  return prompt.choices
    .filter((choice) => choice?.type !== "separator")
    .map((choice) =>
      typeof choice === "object" && choice !== null
        ? "value" in choice
          ? choice.value
          : choice.name
        : choice,
    );
}

/**
 * Turns `--input` values into answers, checked the way inquirer would check
 * them: choices, `filter` and `validate`. With `fillDefaults`, inputs that
 * weren't given take the prompt's default, and a prompt with no default is
 * missing. Without it, they're left for an interactive prompt.
 */
export async function resolveAnswers(
  prompts: Prompt[],
  given: Record<string, string[]>,
  fillDefaults: boolean,
): Promise<Answers> {
  const names = prompts.map((prompt) => prompt.name);
  const unknown = Object.keys(given).filter((key) => !names.includes(key));
  if (unknown.length > 0) {
    throw new CliError(
      "UNKNOWN_INPUT",
      `Unknown input ${unknown.join(", ")}. Inputs: ${names.join(", ")}.`,
      { inputs: names, unknown },
    );
  }

  const answers: Answers = {};
  const missing: InputInfo[] = [];
  const invalid: { name: string; reason: string; value: unknown }[] = [];

  for (const prompt of prompts) {
    if (!(await isAsked(prompt, answers))) continue;
    const raw = given[prompt.name];
    let value: unknown;
    if (raw !== undefined) {
      const parsed = parse(prompt, raw);
      if ("reason" in parsed) {
        invalid.push({
          name: prompt.name,
          reason: parsed.reason,
          value: raw.join(","),
        });
        continue;
      }
      value = parsed.value;
    } else if (fillDefaults) {
      value =
        typeof prompt.default === "function"
          ? await prompt.default(answers)
          : prompt.default;
      if (value === undefined) {
        missing.push(describeInput(prompt));
        continue;
      }
    } else {
      continue;
    }

    if (typeof prompt.filter === "function") {
      value = await prompt.filter(value, answers);
    }
    const verdict =
      typeof prompt.validate === "function"
        ? await prompt.validate(value, answers)
        : true;
    if (verdict !== true) {
      invalid.push({
        name: prompt.name,
        reason: typeof verdict === "string" ? verdict : "Invalid value",
        value,
      });
      continue;
    }
    answers[prompt.name] = value;
  }

  if (missing.length > 0) {
    const pass = missing.map(
      (input) => `--input ${input.name}=<${input.type}>`,
    );
    throw new CliError(
      "MISSING_INPUT",
      `Missing ${missing.map((input) => input.name).join(", ")}. Pass ${pass.join(" ")}.`,
      { missing },
    );
  }
  if (invalid.length > 0) {
    throw new CliError(
      "INVALID_INPUT",
      invalid.map((input) => `${input.name}: ${input.reason}`).join("\n"),
      { invalid },
    );
  }
  return answers;
}

async function isAsked(prompt: Prompt, answers: Answers): Promise<boolean> {
  if (typeof prompt.when === "function")
    return Boolean(await prompt.when(answers));
  return prompt.when !== false;
}

const BOOLEANS: Record<string, boolean> = {
  "0": false,
  "1": true,
  false: false,
  n: false,
  no: false,
  true: true,
  y: true,
  yes: true,
};

function parse(
  prompt: Prompt,
  raw: string[],
): { value: unknown } | { reason: string } {
  const choices = choicesOf(prompt);
  const notAChoice = (value: unknown) =>
    choices && !choices.includes(value)
      ? `Must be one of: ${choices.join(", ")}`
      : undefined;

  if (prompt.type === "checkbox") {
    const values = raw
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    const reason = values.map(notAChoice).find(Boolean);
    return reason ? { reason } : { value: values };
  }
  if (raw.length > 1) return { reason: "Given more than once" };
  const text = raw[0] ?? "";

  if (prompt.type === "confirm") {
    const value = BOOLEANS[text.trim().toLowerCase()];
    return value === undefined
      ? { reason: "Must be true or false" }
      : { value };
  }
  if (prompt.type === "number") {
    const value = Number(text);
    return text.trim() === "" || Number.isNaN(value)
      ? { reason: "Must be a number" }
      : { value };
  }
  const reason = notAChoice(text);
  return reason ? { reason } : { value: text };
}

type Action = {
  data?: unknown;
  force?: unknown;
  path?: unknown;
  skipIfExists?: unknown;
  type?: unknown;
};

/**
 * Files the generator's `add` actions would create that already exist, so a
 * run can be refused before it writes anything.
 */
export function findConflicts(
  plop: NodePlopAPI,
  generator: PlopGenerator,
  answers: Answers,
): string[] {
  const root = plop.getDestBasePath();
  const actions: unknown =
    typeof generator.actions === "function"
      ? generator.actions({ ...answers })
      : generator.actions;
  if (!Array.isArray(actions)) return [];

  const conflicts: string[] = [];
  for (const action of actions as Action[]) {
    if (typeof action !== "object" || action === null) continue;
    if (action.type !== "add" || action.skipIfExists || action.force) continue;
    if (typeof action.path !== "string") continue;
    const data = typeof action.data === "object" ? action.data : {};
    let target: string;
    try {
      target = path.resolve(
        root,
        plop.renderString(action.path, { ...data, ...answers }),
      );
    } catch {
      continue; // Uses a helper only the generator's own plopfile has; add will still refuse to overwrite.
    }
    if (existsSync(target))
      conflicts.push(toPosix(path.relative(root, target)));
  }
  return conflicts;
}

/** Runs the actions and turns Plop's display strings into file results. */
export async function runActions(
  plop: NodePlopAPI,
  generator: PlopGenerator,
  answers: Answers,
): Promise<{ files: FileResult[]; messages: string[] }> {
  const root = plop.getDestBasePath();
  const { changes, failures } = await generator.runActions(answers);
  const files: FileResult[] = [];
  const messages: string[] = [];
  const relative = (file: string) =>
    toPosix(
      path.relative(root, path.resolve(root, file.replace(/^[/\\]+/, ""))),
    );

  for (const { path: text, type } of changes) {
    const skipped = /^\[SKIPPED\] (.*) \(exists\)$/.exec(text);
    if (skipped?.[1]) {
      files.push({
        path: toPosix(path.relative(root, skipped[1])),
        status: "skipped",
      });
    } else if (type === "add") {
      files.push({ path: relative(text), status: "created" });
    } else if (type === "modify" || type === "append") {
      files.push({ path: relative(text), status: "modified" });
    } else if (type === "addMany") {
      // Lists its files only with `verbose: true`.
      for (const line of text.split("\n").slice(1)) {
        files.push({
          path: relative(line.replace(/^ -> /, "")),
          status: "created",
        });
      }
    } else {
      messages.push(text);
    }
  }

  if (failures.length > 0) {
    const errors = failures
      .map((failure) => failure.error)
      .filter((error) => error !== "Aborted due to previous action failure");
    throw new CliError("ACTION_FAILED", errors.join("\n"), { failures, files });
  }
  return { files, messages };
}

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}
