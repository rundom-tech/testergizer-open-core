import path from "path";
import { runSuiteFromFile } from "./runSuiteFromFile";
import type { ExecutionMode } from "../core/types";

export interface RunArgs {
  file: string;
  mode?: ExecutionMode;
  headed?: boolean;
  headless?: boolean;
  slowMo?: number;
  baseUrl?: string;
  out?: string;
}

export async function run(args: RunArgs) {
  const resolvedPath = path.resolve(args.file);

  const executionMode = args.mode ?? "stub";

  const headless =
    args.headed === true
      ? false
      : args.headless === true
      ? true
      : true;

  await runSuiteFromFile(resolvedPath, {
    executionMode,
    artifactsDir: args.out ?? "artifacts",
    headless,
    slowMoMs: args.slowMo,
    baseUrl: args.baseUrl
  });
}
