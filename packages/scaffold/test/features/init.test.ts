import { describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START } from "../../src/cli/init.ts";
import { biomeCheck, createSandbox } from "../support/sandbox.ts";

describe("Feature: init", () => {
  describe("Scenario: a fresh project", () => {
    it("writes only the plopfile and the AGENTS.md block", async () => {
      const project = createSandbox();

      const result = await project.run(["init", "--json"]);

      expect(result.code).toBe(0);
      expect(result.json()).toEqual({
        files: [
          { path: "generators/plopfile.ts", status: "created" },
          { path: "AGENTS.md", status: "created" },
        ],
        ok: true,
        schemaVersion: 1,
      });
      expect(Object.keys(project.tree())).toEqual([
        "AGENTS.md",
        "generators/plopfile.ts",
        "package.json",
      ]);
      expect(project.read("generators/plopfile.ts")).toMatchSnapshot();
      expect(project.read("AGENTS.md")).toMatchSnapshot();
    });

    it("writes a plopfile that passes @rammio/biome-config", async () => {
      const project = createSandbox();
      await project.run(["init"]);

      const check = biomeCheck(project, ["generators"]);

      expect(check.output).toContain("No fixes applied");
      expect(check.code).toBe(0);
    });

    it("uses the project's package manager in the rules", async () => {
      const project = createSandbox();
      project.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");

      await project.run(["init"]);

      expect(project.read("AGENTS.md")).toContain(
        "`pnpm exec rammio-scaffold list --json`",
      );
    });

    it("writes no rules with --no-agents", async () => {
      const project = createSandbox();

      await project.run(["init", "--no-agents"]);

      expect(project.exists("AGENTS.md")).toBe(false);
      expect(project.exists("generators/plopfile.ts")).toBe(true);
    });
  });

  describe("Scenario: an existing AGENTS.md", () => {
    it("keeps its content and appends the block", async () => {
      const project = createSandbox();
      project.write("AGENTS.md", "# Project notes\n\nUse pnpm.\n");

      const result = await project.run(["init", "--json"]);

      expect(result.json().files[1]).toEqual({
        path: "AGENTS.md",
        status: "modified",
      });
      expect(
        project
          .read("AGENTS.md")
          .startsWith(`# Project notes\n\nUse pnpm.\n\n${BLOCK_START}`),
      ).toBe(true);
    });
  });

  describe("Scenario: running init again", () => {
    it("keeps the plopfile and updates the block in place", async () => {
      const project = createSandbox();
      await project.run(["init"]);
      project.write("generators/plopfile.ts", "// my composition\n");
      project.write(
        "AGENTS.md",
        `# Agents\n\n${project.read("AGENTS.md").replace("Scaffolding", "Old")}\nMore notes.\n`,
      );

      const result = await project.run(["init", "--json"]);

      expect(result.json().files).toEqual([
        { path: "generators/plopfile.ts", status: "skipped" },
        { path: "AGENTS.md", status: "modified" },
      ]);
      const agents = project.read("AGENTS.md");
      expect(agents.split(BLOCK_START)).toHaveLength(2);
      expect(agents.split(BLOCK_END)).toHaveLength(2);
      expect(agents).toContain("## Scaffolding");
      expect(agents).toContain("More notes.");
      expect(project.read("generators/plopfile.ts")).toBe(
        "// my composition\n",
      );
    });
  });
});
