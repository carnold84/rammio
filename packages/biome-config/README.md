# @rammio/biome-config

Shared Biome 2 config.

```jsonc
// biome.json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["@rammio/biome-config/biome"]
}
```

Install it alongside Biome, pinning Biome to an exact version:

```sh
pnpm add -D -E @biomejs/biome @rammio/biome-config
```

Biome recommends the exact pin because patch releases can change lint and format output.

## What it enforces

| Convention                                     | Rule                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kebab-case file names                          | `style/useFilenamingConvention` (off under `routes/` for router file conventions)                                                                                                                                                                                                                                            |
| Named exports only                             | `style/noDefaultExport` (off for `*.config.*`, stories, `.storybook/`, `.d.ts`)                                                                                                                                                                                                                                           |
| No barrels inside apps                         | `performance/noBarrelFile`, `performance/noReExportAll` (both off for `src/index.{ts,tsx,js,jsx}`, a library's public entry point; `noBarrelFile` alone off for `features/*/index.{ts,tsx}` and `components/*/index.{ts,tsx}`, so a feature or component folder may have an index that names its exports but not `export *`) |
| `import type` / `export type`                  | `style/useImportType`, `style/useExportType`                                                                                                                                                                                                                                                                                 |
| Fast Refresh safe component files              | `style/useComponentExportOnlyModules` (warn)                                                                                                                                                                                                                                                                                 |
| `type` over `interface`                        | `style/useConsistentTypeDefinitions` (warn)                                                                                                                                                                                                                                                                                  |
| No `enum` / `namespace` / parameter properties | `style/noEnum`, `style/noNamespace`, `style/noParameterProperties`                                                                                                                                                                                                                                                           |
| Function components only                       | `style/useReactFunctionComponents`                                                                                                                                                                                                                                                                                           |
| Naming conventions                             | `style/useNamingConvention` (warn, off in tests; object and type property keys may use any case so API payloads, MSW handlers and HTTP headers stay quiet)                                                                                                                                                                   |
| Hooks rules                                    | `correctness/useHookAtTopLevel`, `correctness/useExhaustiveDependencies`                                                                                                                                                                                                                                                     |

Formatting: 2 spaces, width 80, double quotes (in JSX too), semicolons, trailing commas. Biome's assist sorts imports, JSX attributes, interface members, CSS properties and `package.json` fields.

## Overriding in a project

Local settings win over extended ones:

```jsonc
{
  "extends": ["@rammio/biome-config/biome"],
  "linter": { "rules": { "style": { "useNamingConvention": "off" } } }
}
```

## Respecting `.gitignore`

The shared config ignores `dist`, `coverage`, generated `*.gen.ts` files (including TanStack Router's `routeTree.gen.ts`), `.changeset`, `.agents/skills` and `.claude/skills`, but it does not turn on Biome's VCS integration, because Biome exits with an error when that is enabled outside a git repository (a Docker build without `.git`, for example). To skip everything in your `.gitignore`, enable it in the project:

```jsonc
{
  "extends": ["@rammio/biome-config/biome"],
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }
}
```

## Enabling Tailwind

Biome's CSS parser rejects Tailwind 4 directives such as `@theme`, `@utility`, `@variant`, `@source` and `@apply` unless told to expect them. The shared config leaves this off, so projects that use Tailwind turn it on:

```jsonc
{
  "extends": ["@rammio/biome-config/biome"],
  "css": { "parser": { "tailwindDirectives": true } }
}
```

## VS Code setup

Install the [Biome extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) (`biomejs.biome`), then add this to the project's `.vscode/settings.json`:

```jsonc
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.biome": "explicit"
  },
  "css.lint.unknownAtRules": "ignore"
}
```

- `editor.defaultFormatter` and `editor.formatOnSave` format files with Biome on save.
- `source.fixAll.biome` applies Biome's safe lint fixes on save.
- `css.lint.unknownAtRules` stops VS Code's built-in CSS linter from flagging Tailwind directives such as `@theme` and `@apply`. Biome still checks CSS once [Tailwind is enabled](#enabling-tailwind).

## Pre-commit filename check

The kebab-case file name rule exists to stop case-only differences in file names, which behave differently on macOS and Linux. Biome's editor extension doesn't show this rule, because the diagnostic has no line to attach to, so a badly named file is easy to commit without noticing.

This command checks only that rule, and only on staged files. Other lint errors and formatting don't block the commit, so work in progress can still be committed:

```sh
biome lint --only=style/useFilenamingConvention --staged --no-errors-on-unmatched
```

To run it on every commit with [Husky](https://typicode.github.io/husky/):

```sh
pnpm add -D husky
pnpm exec husky init
```

Then replace the contents of `.husky/pre-commit` with:

```sh
pnpm exec biome lint --only=style/useFilenamingConvention --staged --no-errors-on-unmatched
```

Files under `routes/` are exempt from the rule, but `--only` still prints an info-level note for them. It doesn't fail the commit.

The hook can be skipped with `git commit --no-verify`, so keep running the full `biome check` in CI.

## Opt-in key sorting

Object keys are deliberately **not** sorted by this config. TanStack Router and TanStack Query infer types from the order of option properties (for example `validateSearch` before `loaderDeps`, or `queryKey` before `queryFn`), so sorting them can break inference.

Turn sorting on per file or folder where order carries no meaning, such as translation catalogues or lookup tables. In Biome 2 it's an assist action, so `biome check` reports unsorted keys and `biome check --write` sorts them:

```jsonc
{
  "extends": ["@rammio/biome-config/biome"],
  "overrides": [
    {
      "includes": ["src/i18n/**"],
      "assist": { "actions": { "source": { "useSortedKeys": "on" } } }
    }
  ]
}
```

Your `overrides` are added to the shared ones; they don't replace them. Don't enable it project-wide. Key sorting stays off for `package.json`, which `useSortedPackageJson` orders by its own conventions instead.
