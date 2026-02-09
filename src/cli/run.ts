/**
 * src/cli/run.ts
**/
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

  /**
   * Runtime-only debug flag.
   * Forwarded to Core; must NOT affect schemas or suite structure.
   */
  debug?: boolean;
}

/**
 * CLI entrypoint for `testergizer run`
 *
 * Responsibilities:
 * - Resolve input path
 * - Normalize CLI flags
 * - Capture launch metadata (command + cwd)
 * - Forward everything verbatim to Core
 */
export async function run(args: RunArgs) {
  const resolvedPath = path.resolve(args.file);

  // Execution mode is a Core concern; CLI only forwards intent
  const executionMode = args.mode ?? "stub";

  /**
   * Headless resolution rules:
   * - --headed explicitly disables headless
   * - --headless explicitly enables headless
   * - default is headless=true
   */
  const headless =
    args.headed === true
      ? false
      : args.headless === true
      ? true
      : true;

  /**
   * Capture full launch command for transparency.
   * This is CLI responsibility only and is persisted verbatim.
   */
  const launchCommand = process.argv.join(" ");

  await runSuiteFromFile(resolvedPath, {
    executionMode,
    artifactsDir: args.out ?? "artifacts",
    headless,
    slowMoMs: args.slowMo,
    baseUrl: args.baseUrl,

    // Forward --debug to Core execution
    // Enables runtime-only relaxation of reusable purity checks
    debug: args.debug === true,

    // Opaque launch metadata (schema-agnostic, runtime only)
    launch: {
      command: launchCommand,
      cwd: process.cwd()
    }
  });
}
