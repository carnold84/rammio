import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { NodePlopAPI } from "node-plop";
import { init } from "./init.ts";
import {
  CliError,
  errorMessage,
  formatFiles,
  type GenerateOutput,
  type InitOutput,
  type Io,
  type ListOutput,
  reportError,
  writeJson,
} from "./output.ts";
import {
  type Answers,
  describeGenerator,
  findConflicts,
  getGenerator,
  openPlop,
  promptsOf,
  resolveAnswers,
  runActions,
} from "./plop.ts";

const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const HELP = `rammio-scaffold ${version}

Usage:
  rammio-scaffold init [--no-agents]
  rammio-scaffold list [--json]
  rammio-scaffold generate <generator> [--input name=value ...]
                  [--interactive | --no-interactive] [--json]

generate prompts only in a terminal, outside CI, when no inputs are given (or
with --interactive). Otherwise it never prompts: a missing or invalid input
fails at once with exit code 2.

Options:
  --json         Print one JSON document on stdout
  --cwd <dir>    Run as if started in <dir>
  -h, --help     Show this help
  -v, --version  Show the version
`;

type Options = {
  agents?: boolean;
  cwd?: string;
  help?: boolean;
  input?: string[];
  interactive?: boolean;
  json?: boolean;
  version?: boolean;
};

/** Runs the CLI and returns the exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const json = argv.includes("--json");
  try {
    const { options, positionals } = parse(argv);
    const [command, ...rest] = positionals;
    const root = path.resolve(io.cwd, options.cwd ?? ".");

    if (options.version) {
      io.stdout.write(`${version}\n`);
      return 0;
    }
    if (options.help || !command || command === "help") {
      io.stdout.write(HELP);
      return 0;
    }
    switch (command) {
      case "init":
        return initCommand(root, options, io);
      case "list":
        return await listCommand(root, options, io);
      case "g":
      case "generate":
        return await generateCommand(root, rest[0], options, io);
      default:
        throw new CliError(
          "USAGE",
          `Unknown command "${command}". Run \`rammio-scaffold --help\`.`,
        );
    }
  } catch (error) {
    return reportError(io, error, json);
  }
}

function parse(argv: string[]): { options: Options; positionals: string[] } {
  try {
    const { positionals, values } = parseArgs({
      allowNegative: true,
      allowPositionals: true,
      args: argv,
      options: {
        agents: { type: "boolean" },
        cwd: { type: "string" },
        help: { short: "h", type: "boolean" },
        input: { multiple: true, short: "i", type: "string" },
        interactive: { type: "boolean" },
        json: { type: "boolean" },
        version: { short: "v", type: "boolean" },
      },
    });
    return { options: values, positionals };
  } catch (error) {
    throw new CliError("USAGE", errorMessage(error));
  }
}

function initCommand(root: string, options: Options, io: Io): number {
  const files = init(root, { agents: options.agents !== false });
  if (options.json) {
    const output: InitOutput = { files, ok: true, schemaVersion: 1 };
    writeJson(io, output);
  } else {
    io.stdout.write(formatFiles(files));
  }
  return 0;
}

async function listCommand(
  root: string,
  options: Options,
  io: Io,
): Promise<number> {
  const plop = await openPlop(root);
  const generators = plop
    .getGeneratorList()
    .map(({ name }) => describeGenerator(name, plop.getGenerator(name)));

  if (options.json) {
    const output: ListOutput = { generators, ok: true, schemaVersion: 1 };
    writeJson(io, output);
    return 0;
  }
  for (const generator of generators) {
    io.stdout.write(`${generator.name}  ${generator.description}\n`);
    if (!generator.inputs) io.stdout.write("  (interactive only)\n");
    for (const input of generator.inputs ?? []) {
      const value = input.choices ? input.choices.join("|") : input.type;
      const note = input.required
        ? "required"
        : `default: ${JSON.stringify(input.default ?? null)}`;
      io.stdout.write(`  --input ${input.name}=<${value}>  ${note}\n`);
    }
  }
  return 0;
}

async function generateCommand(
  root: string,
  requested: string | undefined,
  options: Options,
  io: Io,
): Promise<number> {
  const plop = await openPlop(root);
  const given = readInputs(options.input ?? []);
  const interactive = isInteractive(options, io, Object.keys(given).length > 0);
  const prompt = io.prompt ?? stderrPrompt(plop);

  let name = requested;
  if (!name) {
    const names = plop.getGeneratorList().map((g) => g.name);
    if (!interactive) {
      throw new CliError("USAGE", `Name a generator: ${names.join(", ")}.`, {
        generators: names,
      });
    }
    const answer = await prompt(
      [
        {
          choices: names,
          message: "Generator",
          name: "generator",
          type: "list",
        },
      ],
      {},
    );
    name = String(answer.generator);
  }

  const generator = getGenerator(plop, name);
  const prompts = promptsOf(generator);
  let answers: Answers;
  if (!prompts) {
    if (!interactive || Object.keys(given).length > 0) {
      throw new CliError(
        "NOT_SCRIPTABLE",
        `"${name}" builds its prompts at run time, so it can only run interactively, without --input.`,
      );
    }
    answers = await generator.runPrompts();
  } else if (interactive) {
    answers = await prompt(
      prompts,
      await resolveAnswers(prompts, given, false),
    );
  } else {
    answers = await resolveAnswers(prompts, given, true);
  }

  const conflicts = findConflicts(plop, generator, answers);
  if (conflicts.length > 0) {
    throw new CliError(
      "FILE_EXISTS",
      `Nothing was written because these files already exist: ${conflicts.join(", ")}`,
      { conflicts },
    );
  }

  const { files, messages } = await runActions(plop, generator, answers);
  if (options.json) {
    const output: GenerateOutput = {
      files,
      generator: name,
      inputs: answers,
      messages,
      ok: true,
      schemaVersion: 1,
    };
    writeJson(io, output);
  } else {
    io.stdout.write(formatFiles(files));
    for (const message of messages) io.stdout.write(`  ${message}\n`);
  }
  return 0;
}

/** `--input k=v`, repeatable. Values stay strings until the prompt's type converts them. */
function readInputs(pairs: string[]): Record<string, string[]> {
  const inputs: Record<string, string[]> = {};
  for (const pair of pairs) {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      throw new CliError("USAGE", `--input expects name=value, got "${pair}".`);
    }
    const key = pair.slice(0, separator).trim();
    inputs[key] = [...(inputs[key] ?? []), pair.slice(separator + 1)];
  }
  return inputs;
}

function isInteractive(options: Options, io: Io, hasInputs: boolean): boolean {
  const ci = io.env.CI;
  const canPrompt =
    io.stdin.isTTY === true && (!ci || ci === "0" || ci === "false");
  if (options.interactive === true && !canPrompt) {
    throw new CliError(
      "USAGE",
      "--interactive needs a terminal (and CI unset).",
    );
  }
  if (options.interactive !== undefined) return options.interactive;
  return canPrompt && !hasInputs;
}

/** The inquirer instance node-plop exposes at run time (missing from its types). */
type Inquirer = {
  createPromptModule: (options: {
    output: NodeJS.WritableStream;
  }) => NonNullable<Io["prompt"]>;
};

/** Inquirer, writing to stderr so stdout stays clean for --json. */
function stderrPrompt(plop: NodePlopAPI): NonNullable<Io["prompt"]> {
  const { inquirer } = plop as unknown as { inquirer: Inquirer };
  return inquirer.createPromptModule({ output: process.stderr });
}
