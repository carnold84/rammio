import { describe, expect, it } from "vitest";
import { biomeCheck, createSandbox, givenProject } from "../support/sandbox.ts";

describe("Feature: generate", () => {
  describe("Scenario: valid inputs", () => {
    it("creates the component files and lists them as created", async () => {
      const project = await givenProject();

      const result = await project.run([
        "generate",
        "component",
        "--input",
        "name=UserCard",
        "--json",
      ]);

      expect(result.code).toBe(0);
      expect(result.json()).toEqual({
        files: [
          { path: "src/components/user-card/user-card.tsx", status: "created" },
          {
            path: "src/components/user-card/user-card.test.tsx",
            status: "created",
          },
          {
            path: "src/components/user-card/user-card.module.css",
            status: "created",
          },
        ],
        generator: "component",
        inputs: {
          dir: "src/components",
          name: "UserCard",
          styles: "css-modules",
          test: true,
        },
        messages: [],
        ok: true,
        schemaVersion: 1,
      });
      expect(project.tree("src")).toMatchSnapshot();
    });

    it("creates a hook and its test", async () => {
      const project = await givenProject();

      const result = await project.run(["g", "hook", "-i", "name=useCounter"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("created  src/hooks/use-counter.ts");
      expect(project.tree("src")).toMatchSnapshot();
    });

    it("produces code that passes @rammio/biome-config", async () => {
      const project = await givenProject();
      await project.run(["generate", "component", "-i", "name=UserCard"]);
      await project.run([
        "generate",
        "component",
        "-i",
        "name=PlainBox",
        "-i",
        "styles=none",
      ]);
      await project.run(["generate", "hook", "-i", "name=useCounter"]);

      const check = biomeCheck(project, ["src", "generators"]);

      expect(check.output).toContain("No fixes applied");
      expect(check.code).toBe(0);
    });

    it("works without init, using the built-in generators", async () => {
      const project = createSandbox();

      const result = await project.run(["generate", "hook", "-i", "name=useA"]);

      expect(result.code).toBe(0);
      expect(project.exists("src/hooks/use-a.ts")).toBe(true);
    });
  });

  describe("Scenario: optional inputs", () => {
    it("leaves out the files a false input turns off", async () => {
      const project = await givenProject();

      const result = await project.run([
        "generate",
        "component",
        "-i",
        "name=Plain",
        "-i",
        "test=no",
        "-i",
        "styles=none",
        "--json",
      ]);

      expect(result.json().files.map((f: { path: string }) => f.path)).toEqual([
        "src/components/plain/plain.tsx",
      ]);
      expect(project.read("src/components/plain/plain.tsx")).not.toContain(
        "module.css",
      );
    });

    it("uses the paths passed to plop.load()", async () => {
      const project = await givenProject();
      project.write(
        "generators/plopfile.ts",
        project
          .read("generators/plopfile.ts")
          .replace('components: "src/components"', 'components: "app/ui"'),
      );

      const result = await project.run([
        "generate",
        "component",
        "-i",
        "name=Badge",
        "--json",
      ]);

      expect(result.json().inputs.dir).toBe("app/ui");
      expect(project.exists("app/ui/badge/badge.tsx")).toBe(true);
    });
  });

  describe("Scenario: missing input", () => {
    it("fails at once with MISSING_INPUT when other inputs are given", async () => {
      const project = await givenProject();

      const result = await project.run(
        ["generate", "component", "-i", "styles=none", "--json"],
        { tty: true },
      );

      expect(result.code).toBe(2);
      expect(result.prompts).toEqual([]);
      expect(result.json().error).toEqual({
        code: "MISSING_INPUT",
        details: {
          missing: [
            {
              message: "Component name in PascalCase, e.g. UserCard",
              name: "name",
              required: true,
              type: "string",
            },
          ],
        },
        message: "Missing name. Pass --input name=<string>.",
      });
      expect(project.exists("src")).toBe(false);
    });

    it.each([
      ["--no-interactive in a terminal", ["--no-interactive"], { tty: true }],
      ["stdin that isn't a terminal", [], { tty: false }],
      ["CI, even in a terminal", [], { env: { CI: "true" }, tty: true }],
    ])("never prompts with %s", async (_, flags, options) => {
      const project = await givenProject();

      const result = await project.run(
        ["generate", "hook", ...flags, "--json"],
        options,
      );

      expect(result.code).toBe(2);
      expect(result.prompts).toEqual([]);
      expect(result.json().error.code).toBe("MISSING_INPUT");
    });
  });

  describe("Scenario: invalid input", () => {
    it("reports every invalid input with the prompt's own reason", async () => {
      const project = await givenProject();

      const result = await project.run([
        "generate",
        "component",
        "-i",
        "name=userCard",
        "-i",
        "styles=tailwind",
        "-i",
        "test=maybe",
        "--json",
      ]);

      expect(result.code).toBe(2);
      expect(result.json().error).toMatchObject({
        code: "INVALID_INPUT",
        details: {
          invalid: [
            {
              name: "name",
              reason: "Use PascalCase, e.g. UserCard",
              value: "userCard",
            },
            {
              name: "styles",
              reason: "Must be one of: css-modules, none",
              value: "tailwind",
            },
            { name: "test", reason: "Must be true or false", value: "maybe" },
          ],
        },
      });
      expect(project.exists("src")).toBe(false);
    });

    it("rejects an unknown input and lists the real ones", async () => {
      const project = await givenProject();

      const result = await project.run([
        "generate",
        "hook",
        "-i",
        "name=useA",
        "-i",
        "tests=false",
        "--json",
      ]);

      expect(result.code).toBe(2);
      expect(result.json().error).toMatchObject({
        code: "UNKNOWN_INPUT",
        details: { inputs: ["name", "dir", "test"], unknown: ["tests"] },
      });
    });

    it("rejects an unknown generator and lists the available ones", async () => {
      const project = await givenProject();

      const result = await project.run(["generate", "page", "--json"]);

      expect(result.code).toBe(2);
      expect(result.json().error).toMatchObject({
        code: "UNKNOWN_GENERATOR",
        details: { generators: ["component", "hook"] },
      });
    });

    it("rejects --input without a value", async () => {
      const project = await givenProject();

      const result = await project.run(["generate", "hook", "-i", "name"]);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Error (USAGE)");
    });
  });

  describe("Scenario: target files exist", () => {
    it("writes nothing and lists every conflict", async () => {
      const project = await givenProject();
      project.write(
        "src/components/user-card/user-card.module.css",
        "/* mine */\n",
      );
      project.write("src/components/user-card/user-card.tsx", "// mine\n");

      const result = await project.run([
        "generate",
        "component",
        "-i",
        "name=UserCard",
        "--json",
      ]);

      expect(result.code).toBe(1);
      expect(result.json().error).toMatchObject({
        code: "FILE_EXISTS",
        details: {
          conflicts: [
            "src/components/user-card/user-card.tsx",
            "src/components/user-card/user-card.module.css",
          ],
        },
      });
      expect(Object.keys(project.tree("src"))).toEqual([
        "src/components/user-card/user-card.module.css",
        "src/components/user-card/user-card.tsx",
      ]);
    });
  });

  describe("Scenario: interactive", () => {
    it("asks every question in a terminal when no inputs are given", async () => {
      const project = await givenProject();

      const result = await project.run(["generate", "component"], {
        answers: { name: "Modal", test: false },
        tty: true,
      });

      expect(result.code).toBe(0);
      expect(result.prompts).toEqual(["name", "dir", "styles", "test"]);
      expect(project.exists("src/components/modal/modal.tsx")).toBe(true);
      expect(project.exists("src/components/modal/modal.test.tsx")).toBe(false);
    });

    it("asks which generator to run when none is named", async () => {
      const project = await givenProject();

      const result = await project.run(["generate"], {
        answers: { generator: "hook", name: "useA" },
        tty: true,
      });

      expect(result.code).toBe(0);
      expect(result.prompts).toEqual(["generator", "name", "dir", "test"]);
    });

    it("with --interactive, asks only for the inputs not given", async () => {
      const project = await givenProject();

      const result = await project.run(
        ["generate", "component", "-i", "name=Card", "--interactive"],
        { tty: true },
      );

      expect(result.code).toBe(0);
      expect(result.prompts).toEqual(["dir", "styles", "test"]);
    });

    it("checks the inputs given with --interactive before asking", async () => {
      const project = await givenProject();

      const result = await project.run(
        ["generate", "component", "-i", "name=card", "--interactive", "--json"],
        { tty: true },
      );

      expect(result.code).toBe(2);
      expect(result.prompts).toEqual([]);
      expect(result.json().error.code).toBe("INVALID_INPUT");
    });

    it("rejects --interactive without a terminal", async () => {
      const project = await givenProject();

      const result = await project.run(
        ["generate", "hook", "--interactive", "--json"],
        { tty: false },
      );

      expect(result.code).toBe(2);
      expect(result.json().error.code).toBe("USAGE");
    });
  });

  describe("Scenario: plain Plop generators", () => {
    it("runs a generator from the project's plopfile non-interactively", async () => {
      const project = await givenProject();
      project.write(
        "generators/templates/util.hbs",
        "export const {{camelCase name}} = 1;\n",
      );
      project.write(
        "generators/plopfile.ts",
        `import type { NodePlopAPI } from "@rammio/scaffold";

export default async function plopfile(plop: NodePlopAPI): Promise<void> {
  await plop.load("@rammio/scaffold");
  plop.setGenerator("util", {
    description: "A utility module",
    prompts: [
      { type: "input", name: "name", message: "Name" },
      { type: "number", name: "count", message: "Count", default: 1 },
    ],
    actions: [
      { type: "add", path: "src/utils/{{kebabCase name}}.ts", templateFile: "templates/util.hbs" },
      () => "ran a custom action",
    ],
  });
}
`,
      );

      const result = await project.run([
        "generate",
        "util",
        "-i",
        "name=formatDate",
        "-i",
        "count=3",
        "--json",
      ]);

      expect(result.code).toBe(0);
      expect(result.json()).toMatchObject({
        files: [{ path: "src/utils/format-date.ts", status: "created" }],
        inputs: { count: 3, name: "formatDate" },
        messages: ["ran a custom action"],
      });
      expect(project.read("src/utils/format-date.ts")).toBe(
        "export const formatDate = 1;\n",
      );
    });

    it("refuses to script a generator whose prompts are a function", async () => {
      const project = await givenProject();
      project.write(
        "generators/plopfile.ts",
        `export default function (plop) {
  plop.setGenerator("dynamic", {
    prompts: async (inquirer) => inquirer.prompt([{ type: "input", name: "name" }]),
    actions: [],
  });
}
`,
      );

      const result = await project.run(["generate", "dynamic", "--json"]);

      expect(result.code).toBe(2);
      expect(result.json().error.code).toBe("NOT_SCRIPTABLE");
    });
  });

  describe("Scenario: a broken template", () => {
    it("fails with ACTION_FAILED, naming the problem and the files already written", async () => {
      const project = await givenProject();
      project.write("generators/templates/hook/hook.test.ts.hbs", "{{#if}}\n");

      const result = await project.run([
        "generate",
        "hook",
        "-i",
        "name=useA",
        "--json",
      ]);

      expect(result.code).toBe(1);
      expect(result.json().error.code).toBe("ACTION_FAILED");
      expect(result.json().error.message).toMatch(/#if/);
      expect(result.json().files).toEqual([
        { path: "src/hooks/use-a.ts", status: "created" },
      ]);
    });
  });

  describe("Scenario: JSON output", () => {
    it("prints exactly one JSON document on stdout and nothing on stderr", async () => {
      const project = await givenProject();

      const result = await project.run([
        "generate",
        "hook",
        "-i",
        "name=useA",
        "--json",
      ]);

      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stdout.trim().split("\n").at(-1)).toBe("}");
      expect(result.stderr).toBe("");
    });
  });
});
