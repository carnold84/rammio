/**
 * Pins the node-plop behaviour the design depends on (L-numbers in
 * docs/plans/scaffold.md). If a node-plop upgrade changes any of it, these
 * fail before the features built on it do.
 */
import nodePlop from "node-plop";
import { describe, expect, it } from "vitest";
import { createSandbox, type Sandbox } from "./support/sandbox.ts";

function givenPack(sandbox: Sandbox) {
  sandbox.write(
    "node_modules/fake-pack/package.json",
    JSON.stringify({ main: "plopfile.js", name: "fake-pack", type: "module" }),
  );
  sandbox.write("node_modules/fake-pack/templates/out.hbs", "{{shout name}}\n");
  sandbox.write(
    "node_modules/fake-pack/templates/plain.hbs",
    "plain {{name}}\n",
  );
  sandbox.write(
    "node_modules/fake-pack/plopfile.js",
    `export default function (plop, cfg) {
  globalThis.__fakePackCfg = cfg;
  plop.setGenerator("shouty", { prompts: [], actions: [{ type: "add", path: "out.txt", templateFile: "templates/out.hbs" }] });
  plop.setGenerator("plain", { prompts: [], actions: [{ type: "add", path: "plain.txt", templateFile: "templates/plain.hbs" }] });
  plop.setGenerator("skip", { prompts: [], actions: [{ type: "add", path: "plain.txt", templateFile: "templates/plain.hbs", skipIfExists: true }] });
}
`,
  );
  sandbox.write(
    "plopfile.js",
    `export default async function (plop) {
  plop.setHelper("shout", (value) => String(value).toUpperCase());
  await plop.load("fake-pack", { paths: { hooks: "lib" } });
}
`,
  );
}

describe("node-plop contract", () => {
  it("L1/L4: load() resolves the package's main and passes destBasePath and the load options to its plopfile", async () => {
    const sandbox = createSandbox();
    givenPack(sandbox);

    const plop = await nodePlop(`${sandbox.root}/plopfile.js`, {
      destBasePath: sandbox.root,
      force: true,
    });

    expect(plop.getGeneratorList().map((g) => g.name)).toEqual([
      "shouty",
      "plain",
      "skip",
    ]);
    expect((globalThis as { __fakePackCfg?: unknown }).__fakePackCfg).toEqual({
      destBasePath: sandbox.root,
      paths: { hooks: "lib" },
    });
  });

  it("L2/L3: a loaded generator resolves templates against the package and ignores the parent's helpers", async () => {
    const sandbox = createSandbox();
    givenPack(sandbox);
    const plop = await nodePlop(`${sandbox.root}/plopfile.js`, {
      destBasePath: sandbox.root,
      force: false,
    });

    const plain = await plop.getGenerator("plain").runActions({ name: "x" });
    const shouty = await plop.getGenerator("shouty").runActions({ name: "x" });

    expect(plain.failures).toEqual([]);
    expect(sandbox.read("plain.txt")).toBe("plain x\n");
    expect(shouty.failures[0]?.error).toMatch(/Missing helper/);
  });

  it("L6: action results are display strings", async () => {
    const sandbox = createSandbox();
    givenPack(sandbox);
    const plop = await nodePlop(`${sandbox.root}/plopfile.js`, {
      destBasePath: sandbox.root,
      force: false,
    });

    const added = await plop.getGenerator("plain").runActions({ name: "x" });
    const skipped = await plop.getGenerator("skip").runActions({ name: "x" });

    expect(added.changes).toEqual([{ path: "/plain.txt", type: "add" }]);
    expect(skipped.changes[0]?.path).toBe(
      `[SKIPPED] ${sandbox.root}/plain.txt (exists)`,
    );
  });

  it("L10: plop.inquirer prompts on any stream and skips questions already answered", async () => {
    const plop = await nodePlop();
    const { inquirer } = plop as unknown as {
      inquirer: {
        createPromptModule: (options: {
          output: NodeJS.WritableStream;
        }) => (
          questions: object[],
          answers: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
    };

    const prompt = inquirer.createPromptModule({ output: process.stderr });
    const answers = await prompt([{ name: "name", type: "input" }], {
      name: "given",
    });

    expect(answers).toEqual({ name: "given" });
  });
});
