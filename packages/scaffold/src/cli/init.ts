import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FileResult } from "./output.ts";

export const BLOCK_START = "<!-- rammio-scaffold:start -->";
export const BLOCK_END = "<!-- rammio-scaffold:end -->";

const PLOPFILE = `import type { NodePlopAPI } from "@rammio/scaffold";

// biome-ignore lint/style/noDefaultExport: Plop runs the default export.
export default async function plopfile(plop: NodePlopAPI): Promise<void> {
  // The @rammio/scaffold generators. A file in ./templates replaces the
  // package template with the same path (see node_modules/@rammio/scaffold/templates).
  await plop.load("@rammio/scaffold", {
    paths: { components: "src/components", hooks: "src/hooks" },
  });

  // Generators set here replace the defaults with the same name, for example:
  // plop.setGenerator("page", { description: "", prompts: [], actions: [] });
}
`;

/** Writes the plopfile if there isn't one, and adds or updates the AGENTS.md block. */
export function init(root: string, options: { agents: boolean }): FileResult[] {
  const files: FileResult[] = [];

  const plopfile = path.join(root, "generators/plopfile.ts");
  if (existsSync(plopfile)) {
    files.push({ path: "generators/plopfile.ts", status: "skipped" });
  } else {
    mkdirSync(path.dirname(plopfile), { recursive: true });
    writeFileSync(plopfile, PLOPFILE);
    files.push({ path: "generators/plopfile.ts", status: "created" });
  }

  if (options.agents) {
    const agents = path.join(root, "AGENTS.md");
    const existing = existsSync(agents)
      ? readFileSync(agents, "utf8")
      : undefined;
    const block = `${BLOCK_START}\n${rules(runCommand(root))}\n${BLOCK_END}`;
    const content = upsertBlock(existing, block);
    if (content !== existing) writeFileSync(agents, content);
    files.push({
      path: "AGENTS.md",
      status:
        existing === undefined
          ? "created"
          : content === existing
            ? "skipped"
            : "modified",
    });
  }
  return files;
}

function rules(run: string): string {
  return `## Scaffolding

This project generates components, hooks and their tests with \`@rammio/scaffold\`. Use it instead of writing that boilerplate by hand, then edit the generated files.

1. \`${run} list --json\` lists the generators and their inputs, with allowed values and defaults.
2. \`${run} generate <generator> --input <name>=<value> --json\` creates the files and prints them as JSON. It never prompts when any input is given: a missing or invalid input exits with a JSON error that says what to pass.
3. If a file it would create already exists, it writes nothing and fails with FILE_EXISTS. Don't delete the existing file unless that's intended.

To change what a generator produces, copy its template from \`node_modules/@rammio/scaffold/templates/\` to the same path under \`generators/templates/\` and edit the copy. Add or replace generators in \`generators/plopfile.ts\`. Never edit files in \`node_modules\`.`;
}

/** How to run the CLI in this project, judged from its lockfile. */
function runCommand(root: string): string {
  const has = (file: string) => existsSync(path.join(root, file));
  if (has("pnpm-lock.yaml")) return "pnpm exec rammio-scaffold";
  if (has("yarn.lock")) return "yarn rammio-scaffold";
  if (has("bun.lock") || has("bun.lockb")) return "bunx rammio-scaffold";
  return "npx rammio-scaffold";
}

/** Replaces the marked block if there is one, otherwise appends it. */
function upsertBlock(existing: string | undefined, block: string): string {
  if (existing === undefined || existing.trim() === "") return `${block}\n`;
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END, start);
  if (start !== -1 && end !== -1) {
    return (
      existing.slice(0, start) + block + existing.slice(end + BLOCK_END.length)
    );
  }
  return `${existing.trimEnd()}\n\n${block}\n`;
}
