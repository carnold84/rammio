# @rammio/scaffold

Code generators for React + TypeScript + Vite projects, built on [Plop](https://plopjs.com) and made to be driven by AI agents as well as people. The generators are ordinary Plop generators; the CLI adds non-interactive runs, JSON output and a check that refuses to overwrite files.

```sh
pnpm add -D @rammio/scaffold
pnpm exec rammio-scaffold init
pnpm exec rammio-scaffold generate component --input name=UserCard
```

Needs Node.js 22.18 or later, which runs a `.ts` plopfile without a build step.

## Commands

| Command                                                                                      | What it does                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `init [--no-agents]`                                                                         | Writes `generators/plopfile.ts` and a scaffolding section in `AGENTS.md`. |
| `list [--json]`                                                                              | Lists the generators with their inputs, allowed values and defaults.      |
| `generate <generator> [--input name=value ...] [--interactive \| --no-interactive] [--json]` | Runs a generator. Alias: `g`. Short form of `--input`: `-i`.              |

Every command takes `--json` (one JSON document on stdout) and `--cwd <dir>`.

### Prompting

`generate` prompts only when stdin is a terminal, `CI` isn't set, and no inputs are given. Once any `--input` is passed it never prompts: a missing or invalid input fails at once with exit code 2 and says what to pass. `--interactive` prompts for the inputs you left out; `--no-interactive` never prompts.

If any file it would create already exists, `generate` writes nothing and lists the conflicts.

### JSON output

```json
{
  "files": [
    { "path": "src/components/user-card/user-card.tsx", "status": "created" }
  ],
  "generator": "component",
  "inputs": {
    "dir": "src/components",
    "name": "UserCard",
    "styles": "css-modules",
    "test": true
  },
  "messages": [],
  "ok": true,
  "schemaVersion": 1
}
```

Errors have `"ok": false` and `"error": { "code", "message", "details" }`. The output types (`ListOutput`, `GenerateOutput`, `InitOutput`, `ErrorOutput`) are exported from the package. Exit codes: 0 success, 1 the run failed, 2 invalid usage or input.

## Generators

| Generator   | Creates                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| `component` | `<dir>/<name>/<name>.tsx`, `.test.tsx` (Vitest + Testing Library) and `.module.css` |
| `hook`      | `<dir>/<name>.ts` and `.test.ts`                                                    |

File names are kebab-case and exports are named, matching [`@rammio/biome-config`](../biome-config/).

## Customising

Everything lives in `generators/`:

```ts
// generators/plopfile.ts
import type { NodePlopAPI } from "@rammio/scaffold";

// biome-ignore lint/style/noDefaultExport: Plop runs the default export.
export default async function plopfile(plop: NodePlopAPI): Promise<void> {
  await plop.load("@rammio/scaffold", {
    paths: { components: "app/ui", hooks: "app/hooks" },
  });

  plop.setGenerator("util", {
    description: "A utility module",
    prompts: [{ type: "input", name: "name", message: "Name in camelCase" }],
    actions: [
      {
        type: "add",
        path: "src/utils/{{kebabCase name}}.ts",
        templateFile: "templates/util.ts.hbs",
      },
    ],
  });
}
```

- **Change a template:** copy it from `node_modules/@rammio/scaffold/templates/` to the same path under `generators/templates/` and edit it. The generator's other templates still come from the package. Pass `templates: "some/dir"` to `plop.load()` to keep overrides elsewhere.
- **Change where files go:** pass `paths` to `plop.load()`.
- **Add or replace a generator:** call `plop.setGenerator()` after `load()`. A generator with the same name as a default replaces it.

`list` and `generate --input` work with your own generators too: inputs come from the prompts' names, types, choices, defaults and `validate` functions. A generator whose `prompts` is a function can only run interactively.

Templates are Handlebars, so a literal `{{` in JSX (`style={{ ... }}`) must be written `\{{`.
