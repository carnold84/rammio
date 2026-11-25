export type ErrorCode =
  | "ACTION_FAILED"
  | "FILE_EXISTS"
  | "INTERNAL_ERROR"
  | "INVALID_INPUT"
  | "MISSING_INPUT"
  | "NOT_SCRIPTABLE"
  | "PLOPFILE_LOAD_FAILED"
  | "UNKNOWN_GENERATOR"
  | "UNKNOWN_INPUT"
  | "USAGE";

export type FileResult = {
  /** Relative to the project root, with forward slashes. */
  path: string;
  status: "created" | "modified" | "skipped";
};

export type InputInfo = {
  choices?: unknown[];
  default?: unknown;
  message?: string;
  name: string;
  /** True when the prompt has no default. */
  required: boolean;
  type: "array" | "boolean" | "number" | "string";
};

export type GeneratorInfo = {
  description: string;
  /** Null when the generator's prompts are a function: it can only run interactively. */
  inputs: InputInfo[] | null;
  name: string;
};

export type ListOutput = {
  generators: GeneratorInfo[];
  ok: true;
  schemaVersion: 1;
};

export type GenerateOutput = {
  files: FileResult[];
  generator: string;
  inputs: Record<string, unknown>;
  /** Results of actions that don't write a file, such as custom actions. */
  messages: string[];
  ok: true;
  schemaVersion: 1;
};

export type InitOutput = {
  files: FileResult[];
  ok: true;
  schemaVersion: 1;
};

export type ErrorOutput = {
  error: { code: ErrorCode; details: Record<string, unknown>; message: string };
  /** Files written before the failure, if any. */
  files: FileResult[];
  ok: false;
  schemaVersion: 1;
};

/** Exit code 1: the run failed. Exit code 2: the caller asked for something invalid. */
const RUN_FAILURES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "ACTION_FAILED",
  "FILE_EXISTS",
  "INTERNAL_ERROR",
  "PLOPFILE_LOAD_FAILED",
]);

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

export type Writer = { write: (chunk: string) => unknown };

/** Everything the CLI touches outside the file system, so tests can fake it. */
export type Io = {
  cwd: string;
  env: Record<string, string | undefined>;
  /** Asks the questions not already in `answers`. Defaults to inquirer, on stderr. */
  prompt?: (
    questions: readonly object[],
    answers: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  stderr: Writer;
  stdin: { isTTY?: boolean };
  stdout: Writer;
};

export function writeJson(io: Io, value: unknown): void {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function formatFiles(files: FileResult[]): string {
  return files
    .map((file) => `  ${file.status.padEnd(8)} ${file.path}\n`)
    .join("");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}

/** Writes the error and returns the exit code. */
export function reportError(io: Io, error: unknown, json: boolean): number {
  const known = error instanceof CliError;
  const code: ErrorCode = known ? error.code : "INTERNAL_ERROR";
  const details = known ? error.details : {};
  const message = errorMessage(error);

  if (json) {
    const output: ErrorOutput = {
      error: { code, details, message },
      files: Array.isArray(details.files) ? details.files : [],
      ok: false,
      schemaVersion: 1,
    };
    writeJson(io, output);
  } else {
    io.stderr.write(`Error (${code}): ${message}\n`);
    if (!known && error instanceof Error && error.stack) {
      io.stderr.write(`${error.stack}\n`);
    }
  }
  return RUN_FAILURES.has(code) ? 1 : 2;
}
