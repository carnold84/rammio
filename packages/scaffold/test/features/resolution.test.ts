import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { givenProject, PACKAGE_DIR } from "../support/sandbox.ts";

const packageTemplate = (id: string) =>
  readFileSync(path.join(PACKAGE_DIR, "templates", id), "utf8");

const generateHook = ["generate", "hook", "-i", "name=useA"];

describe("Feature: template overrides", () => {
  describe("Scenario: no local template", () => {
    it("uses the package template", async () => {
      const project = await givenProject();

      await project.run(generateHook);

      expect(project.read("src/hooks/use-a.ts")).toBe(
        packageTemplate("hook/hook.ts.hbs")
          .replaceAll("{{pascalCase name}}", "UseA")
          .replaceAll("{{camelCase name}}", "useA"),
      );
    });
  });

  describe("Scenario: a local template", () => {
    it("replaces that template only; the generator's other templates stay the package's", async () => {
      const project = await givenProject();
      project.write(
        "generators/templates/hook/hook.ts.hbs",
        "// local {{camelCase name}}\n",
      );

      await project.run(generateHook);

      expect(project.read("src/hooks/use-a.ts")).toBe("// local useA\n");
      expect(project.read("src/hooks/use-a.test.ts")).toContain(
        'describe("useA"',
      );
    });

    it("goes back to the package template once the local one is removed", async () => {
      const project = await givenProject();
      project.write("generators/templates/hook/hook.ts.hbs", "// local\n");
      await project.run(generateHook);
      project.remove("generators/templates/hook/hook.ts.hbs");

      await project.run(["generate", "hook", "-i", "name=useB"]);

      expect(project.read("src/hooks/use-b.ts")).toContain("useState");
    });

    it("reads overrides from the templates folder passed to plop.load()", async () => {
      const project = await givenProject();
      project.write(
        "generators/plopfile.ts",
        `export default async function (plop) {
  await plop.load("@rammio/scaffold", { templates: "tools/templates" });
}
`,
      );
      project.write("tools/templates/hook/hook.ts.hbs", "// tools\n");

      await project.run(generateHook);

      expect(project.read("src/hooks/use-a.ts")).toBe("// tools\n");
    });
  });

  describe("Scenario: replacing a generator", () => {
    it("a generator set in the plopfile after load() replaces the default", async () => {
      const project = await givenProject();
      project.write(
        "generators/plopfile.ts",
        `export default async function (plop) {
  await plop.load("@rammio/scaffold");
  plop.setGenerator("hook", {
    description: "Our hook",
    prompts: [{ type: "input", name: "name" }],
    actions: [{ type: "add", path: "lib/{{name}}.ts", template: "// ours\\n" }],
  });
}
`,
      );

      const result = await project.run([...generateHook, "--json"]);

      expect(result.json().files).toEqual([
        { path: "lib/useA.ts", status: "created" },
      ]);
    });
  });
});
