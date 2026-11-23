import { describe, expect, it } from "vitest";
import { givenProject } from "../support/sandbox.ts";

describe("Feature: list", () => {
  describe("Scenario: the default generators", () => {
    it("lists each generator's inputs from its prompts, as JSON", async () => {
      const project = await givenProject();

      const result = await project.run(["list", "--json"]);

      expect(result.code).toBe(0);
      expect(result.json()).toEqual({
        generators: [
          {
            description:
              "React component in its own folder, with a Vitest + Testing Library test and a CSS module",
            inputs: [
              {
                message: "Component name in PascalCase, e.g. UserCard",
                name: "name",
                required: true,
                type: "string",
              },
              {
                default: "src/components",
                message: "Folder to create the component folder in",
                name: "dir",
                required: false,
                type: "string",
              },
              {
                choices: ["css-modules", "none"],
                default: "css-modules",
                message: "Styling",
                name: "styles",
                required: false,
                type: "string",
              },
              {
                default: true,
                message: "Add a test?",
                name: "test",
                required: false,
                type: "boolean",
              },
            ],
            name: "component",
          },
          {
            description: "React hook with a Vitest + Testing Library test",
            inputs: [
              {
                message:
                  "Hook name in camelCase starting with use, e.g. useCounter",
                name: "name",
                required: true,
                type: "string",
              },
              {
                default: "src/hooks",
                message: "Folder to create the hook in",
                name: "dir",
                required: false,
                type: "string",
              },
              {
                default: true,
                message: "Add a test?",
                name: "test",
                required: false,
                type: "boolean",
              },
            ],
            name: "hook",
          },
        ],
        ok: true,
        schemaVersion: 1,
      });
    });

    it("prints a readable summary without --json", async () => {
      const project = await givenProject();

      const result = await project.run(["list"]);

      expect(result.stdout).toContain(
        '  --input styles=<css-modules|none>  default: "css-modules"',
      );
      expect(result.stdout).toContain("  --input name=<string>  required");
    });
  });

  describe("Scenario: the project's own generators", () => {
    it("lists plain Plop generators, and marks function prompts as interactive only", async () => {
      const project = await givenProject();
      project.write(
        "generators/plopfile.ts",
        `export default async function (plop) {
  await plop.load("@rammio/scaffold");
  plop.setGenerator("page", {
    description: "A route",
    prompts: [
      { type: "checkbox", name: "parts", message: "Parts", choices: [{ name: "Loader", value: "loader" }, "action"] },
    ],
    actions: [],
  });
  plop.setGenerator("dynamic", { prompts: async () => ({}), actions: [] });
}
`,
      );

      const result = await project.run(["list", "--json"]);

      const generators = result.json().generators;
      expect(generators.map((g: { name: string }) => g.name)).toEqual([
        "component",
        "hook",
        "page",
        "dynamic",
      ]);
      expect(generators[2].inputs).toEqual([
        {
          choices: ["loader", "action"],
          message: "Parts",
          name: "parts",
          required: true,
          type: "array",
        },
      ]);
      expect(generators[3]).toEqual({
        description: "",
        inputs: null,
        name: "dynamic",
      });
    });

    it("reports a plopfile that won't load", async () => {
      const project = await givenProject();
      project.write("generators/plopfile.ts", "export default 42;\n");

      const result = await project.run(["list", "--json"]);

      expect(result.code).toBe(1);
      expect(result.json().error.code).toBe("PLOPFILE_LOAD_FAILED");
      expect(result.json().error.message).toContain("generators/plopfile.ts");
    });
  });
});
