import { plopfile } from "./plopfile.ts";

export type { NodePlopAPI } from "node-plop";
export type {
  ErrorCode,
  ErrorOutput,
  FileResult,
  GenerateOutput,
  GeneratorInfo,
  InitOutput,
  InputInfo,
  ListOutput,
} from "./cli/output.ts";
export type { ScaffoldOptions, ScaffoldPaths } from "./plopfile.ts";

// biome-ignore lint/style/noDefaultExport: plop.load() runs the package's default export.
export default plopfile;
