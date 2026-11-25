import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionType, NodePlopAPI, PlopCfg } from "node-plop";

export type ScaffoldPaths = {
  components: string;
  hooks: string;
};

/** Options for `plop.load("@rammio/scaffold", options)`. */
export type ScaffoldOptions = {
  /** Where the generators put new files, relative to the project root. */
  paths?: Partial<ScaffoldPaths>;
  /**
   * Folder of template overrides, relative to the project root. A file here
   * replaces the package template with the same path. Default: `generators/templates`.
   */
  templates?: string;
};

declare module "node-plop" {
  // Lets plopfiles pass ScaffoldOptions to plop.load() with type checking.
  // biome-ignore lint/style/useConsistentTypeDefinitions: only an interface merges into node-plop's.
  interface PlopCfg {
    paths?: Partial<ScaffoldPaths>;
    templates?: string;
  }
}

const PACKAGE_TEMPLATES = fileURLToPath(
  new URL("../templates/", import.meta.url),
);

/**
 * The package's plopfile. `plop.load()` calls it with the project root as
 * `destBasePath` plus the options the project passed.
 */
export function plopfile(
  plop: NodePlopAPI,
  options: Partial<PlopCfg> = {},
): void {
  const root = options.destBasePath ?? plop.getDestBasePath();
  const paths: ScaffoldPaths = {
    components: "src/components",
    hooks: "src/hooks",
    ...options.paths,
  };
  const localTemplates = path.resolve(
    root,
    options.templates ?? "generators/templates",
  );

  /** The project's copy of a template if it has one, else the package's. */
  const template = (id: string): string => {
    const local = path.join(localTemplates, id);
    return existsSync(local) ? local : path.join(PACKAGE_TEMPLATES, id);
  };
  const add = (to: string, id: string): ActionType => ({
    path: to,
    templateFile: template(id),
    type: "add",
  });

  plop.setHelper("eq", (a: unknown, b: unknown) => a === b);

  plop.setGenerator("component", {
    description:
      "React component in its own folder, with a Vitest + Testing Library test and a CSS module",
    prompts: [
      {
        message: "Component name in PascalCase, e.g. UserCard",
        name: "name",
        type: "input",
        validate: (value: string) =>
          /^[A-Z][A-Za-z0-9]*$/.test(value) || "Use PascalCase, e.g. UserCard",
      },
      {
        default: paths.components,
        message: "Folder to create the component folder in",
        name: "dir",
        type: "input",
      },
      {
        choices: ["css-modules", "none"],
        default: "css-modules",
        message: "Styling",
        name: "styles",
        type: "list",
      },
      {
        default: true,
        message: "Add a test?",
        name: "test",
        type: "confirm",
      },
    ],
    actions: (data = {}) => {
      const base = "{{dir}}/{{kebabCase name}}/{{kebabCase name}}";
      return [
        add(`${base}.tsx`, "component/component.tsx.hbs"),
        ...(data.test
          ? [add(`${base}.test.tsx`, "component/component.test.tsx.hbs")]
          : []),
        ...(data.styles === "css-modules"
          ? [add(`${base}.module.css`, "component/component.module.css.hbs")]
          : []),
      ];
    },
  });

  plop.setGenerator("hook", {
    description: "React hook with a Vitest + Testing Library test",
    prompts: [
      {
        message: "Hook name in camelCase starting with use, e.g. useCounter",
        name: "name",
        type: "input",
        validate: (value: string) =>
          /^use[A-Z][A-Za-z0-9]*$/.test(value) ||
          "Use camelCase starting with use, e.g. useCounter",
      },
      {
        default: paths.hooks,
        message: "Folder to create the hook in",
        name: "dir",
        type: "input",
      },
      {
        default: true,
        message: "Add a test?",
        name: "test",
        type: "confirm",
      },
    ],
    actions: (data = {}) => [
      add("{{dir}}/{{kebabCase name}}.ts", "hook/hook.ts.hbs"),
      ...(data.test
        ? [add("{{dir}}/{{kebabCase name}}.test.ts", "hook/hook.test.ts.hbs")]
        : []),
    ],
  });
}
