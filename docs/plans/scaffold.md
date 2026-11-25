# Plan: `@rammio/scaffold`

A thin wrapper around [node-plop](https://github.com/plopjs/node-plop) that ships React + TypeScript + Vite generators and a CLI that people and AI agents can both drive. Generators are plain Plop generators; the CLI adds non-interactive runs, JSON output and a check for existing files.

## 1. Structure

```
packages/scaffold/
  src/
    index.ts        # default export = the plopfile; types for options and JSON output
    plopfile.ts     # the component and hook generators, and local-first template lookup
    cli/
      bin.ts        # entry point
      main.ts       # argument parsing, init/list/generate, prompting rules
      plop.ts       # loading the plopfile, reading prompts, checking inputs, running actions
      init.ts       # generators/plopfile.ts and the AGENTS.md block
      output.ts     # error codes, JSON output types, error reporting
  templates/        # component/*.hbs, hook/*.hbs
  test/
```

A project that uses it has `generators/plopfile.ts` and, optionally, `generators/templates/` with the templates it overrides:

```ts
import type { NodePlopAPI } from "@rammio/scaffold";

// biome-ignore lint/style/noDefaultExport: Plop runs the default export.
export default async function plopfile(plop: NodePlopAPI): Promise<void> {
  await plop.load("@rammio/scaffold", {
    paths: { components: "src/components", hooks: "src/hooks" },
  });
  // plop.setGenerator("hook", { ... }) here replaces the default
}
```

Without a plopfile, the CLI runs the package's generators directly.

## 2. How it builds on Plop

- **Options** go through `plop.load("@rammio/scaffold", { paths, templates })`. node-plop hands them to the package plopfile with the project root as `destBasePath` (L4). A module augmentation of node-plop's `PlopCfg` interface makes them type-check in the user's plopfile.
- **Template overrides:** each `add` action asks for its template by id, for example `component/component.tsx.hbs`. If `generators/templates/<id>` exists (or `<templates option>/<id>`) it's used, otherwise the package copy. The lookup runs when the actions are built, so adding or deleting a local template takes effect on the next run.
- **Replacing or adding generators** is plain Plop: `plop.setGenerator()` after `load()`.
- **Inputs are the inquirer prompts.** `list` reads each prompt's name, type, message, choices and default; a prompt with no default is required. `generate` checks `--input` values against the same prompts (type, choices, `filter`, `validate`), so one definition serves humans and agents, and the project's own generators get the same treatment.

### node-plop behaviour this depends on

`test/node-plop-contract.test.ts` pins these, so a node-plop upgrade that changes them fails there first.

| #   | Behaviour                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| L1  | `load()` finds the package with `resolve.sync`, which reads `main`.                                                      |
| L2  | Loaded generators run in the loaded instance: its templates, helpers and partials, not the parent's.                     |
| L3  | There's no template search path; relative `templateFile`s resolve against the plopfile that defines them.                |
| L4  | `load()` calls the loaded plopfile with `{ destBasePath, ...loadOptions }`.                                              |
| L6  | Action results are display strings (`/rel/path`, `[SKIPPED] abs (exists)`, `N files added`), and nothing is rolled back. |
| L8  | The plopfile is loaded with a plain `import()`, so `.ts` plopfiles rely on Node's type stripping (22.18+).               |
| L9  | Handlebars `{{` collides with JSX `style={{ … }}`; templates must write `\{{`.                                           |
| L10 | `plop.inquirer.createPromptModule({ output })(questions, answers)` asks only the questions not already in `answers`.     |

## 3. CLI

| Command                                                                        | Behaviour                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `init [--no-agents]`                                                           | Writes `generators/plopfile.ts` unless it exists; adds or updates a marked block in `AGENTS.md`. |
| `list [--json]`                                                                | Generators with their inputs. Generators whose prompts are a function have `inputs: null`.       |
| `generate <name> [--input k=v …] [--interactive \| --no-interactive] [--json]` | Alias `g`. Repeat `--input` for a checkbox prompt, or use commas.                                |

All commands take `--json` and `--cwd <dir>`.

**Prompting.** `generate` prompts only when stdin is a terminal, `CI` isn't set and no inputs are given. Any `--input` makes it non-interactive: missing or invalid inputs fail at once. `--interactive` checks the given inputs, then asks for the rest; it fails with `USAGE` without a terminal. Prompts go to stderr, so stdout stays clean.

**Before writing**, it renders the path of each `add` action and fails with `FILE_EXISTS` if any target exists. This works for any Plop generator. A path that uses a helper only the generator's own plopfile has is skipped; Plop's `add` still refuses to overwrite it.

**Output.** `--json` prints one document: `{ schemaVersion: 1, ok: true, … }` or `{ schemaVersion: 1, ok: false, error: { code, message, details }, files }`. The types are exported from the package (`ListOutput`, `GenerateOutput`, `InitOutput`, `ErrorOutput`).

| Code                   | Exit | When                                                                                    |
| ---------------------- | ---- | --------------------------------------------------------------------------------------- |
| `USAGE`                | 2    | Bad arguments, no generator named non-interactively, `--interactive` without a terminal |
| `UNKNOWN_GENERATOR`    | 2    | `details.generators` lists the real ones                                                |
| `UNKNOWN_INPUT`        | 2    | `details.inputs` lists the real ones                                                    |
| `MISSING_INPUT`        | 2    | `details.missing` describes each input like `list` does                                 |
| `INVALID_INPUT`        | 2    | `details.invalid` gives each value and the prompt's `validate` message                  |
| `NOT_SCRIPTABLE`       | 2    | The generator's prompts are a function                                                  |
| `FILE_EXISTS`          | 1    | `details.conflicts`; nothing was written                                                |
| `ACTION_FAILED`        | 1    | `details.failures` from Plop; `files` lists what was written first                      |
| `PLOPFILE_LOAD_FAILED` | 1    | With a hint when Node can't strip the plopfile's TypeScript                             |
| `INTERNAL_ERROR`       | 1    | Anything else                                                                           |

## 4. Generators

Stack defaults: CSS Modules, Vitest with React Testing Library, named exports and kebab-case file names. Component folders have no `index.ts`; import from the component file. Generated code passes `@rammio/biome-config`.

| Generator     | Inputs                                                               | Status |
| ------------- | -------------------------------------------------------------------- | ------ |
| `component`   | `name` (PascalCase), `dir`, `styles`, `test`                         | Done   |
| `hook`        | `name` (`use…`), `dir`, `test`                                       | Done   |
| `test`        | A co-located test for an existing file                               | Next   |
| `msw-handler` | `mocks/handlers/<resource>.ts` plus an append to `mocks/handlers.ts` | Next   |

## 5. Testing

Plain Vitest, named `Feature: …` > `Scenario: …`. Each test gets a temp project with the package symlinked into `node_modules`, and the CLI runs in-process with a fake prompt. The global setup builds `dist/` first, because `plop.load()` loads the package through `main`.

- `test/features/*.test.ts`: `generate`, `list`, `init`, template overrides.
- `test/features/process.test.ts`: the built bin with stdin as an open pipe, so a prompt would hang the test. Also covers TypeScript that Node can't strip, which only shows up outside Vitest.
- `test/node-plop-contract.test.ts`: the L-numbered behaviour above.

## 6. Trade-offs accepted for a thin wrapper

- `list --json` describes only what inquirer prompts express. Constraints show up in the prompt `message` and the `validate` error.
- No `--force`: delete the file and run again.
- Templates are only checked when rendered, so a broken template can fail after earlier files were written (`ACTION_FAILED` lists them).
- Only templates layer. A project can't swap one helper or partial inside a package template; it copies the template instead.
- No path check: an input like `dir=../x` writes outside the project, as Plop would.

## 7. Next

1. The `test` and `msw-handler` generators.
2. A changeset for the first release; run the tests in CI.
3. Maybe: `eject <template>` (copy a package template into `generators/templates/`), and a way to see which local templates differ from the current package version after an upgrade.
