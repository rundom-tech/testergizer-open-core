// src/cli/run.ts

import path from "path";
import { runSuiteFromFile } from "./runSuiteFromFile";
import type {
  ExecutionEngine,
  ExecutionIntent,
  ValidationMode
} from "../core/types";

export interface RunArgs {
  suitePath: string;
  executionEngine?: ExecutionEngine;
  executionIntent?: ExecutionIntent;
  debug?: boolean;

  baseUrl?: string;
  browserName?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  slowMoMs?: number;
  retries?: number;
}

export async function run(args: RunArgs) {
  return runSuiteFromFile(args.suitePath, args);
}

/* -----------------------------------------------------------
 * CLI Wrapper
 * ----------------------------------------------------------- */

function getFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

// Only execute when invoked directly from CLI
if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);

    if (argv.length === 0) {
      console.error("Usage: testergizer <suitePath> [options]");
      process.exit(1);
    }

    const suitePath = path.resolve(argv[0]);

    const engineRaw = getFlag("--engine");
    const engine: ExecutionEngine =
      (engineRaw as ExecutionEngine) ?? "testergizer";

    if (engine !== "testergizer" && engine !== "playwright") {
      throw new Error(
        `Unsupported engine "${engine}". Supported: testergizer | playwright`
      );
    }

    const intentRaw = getFlag("--intent");
    let intent: ExecutionIntent;

    if (engine === "testergizer") {
      intent = "review";
      if (intentRaw) {
        console.warn(
          `⚠️  --intent ignored for engine "testergizer" (review is implicit).`
        );
      }
    } else {
      intent = (intentRaw ?? "verify") as ExecutionIntent;

      if (intent === "review") {
        throw new Error(
          `Intent "review" is not supported by engine "playwright".`
        );
      }

      if (intent !== "verify" && intent !== "baseline") {
        throw new Error(
          `Unsupported intent "${intent}" for engine "playwright".`
        );
      }
    }

    const headless =
      hasFlag("--headed") ? false :
      hasFlag("--headless") ? true :
      undefined;

    await run({
      suitePath,
      executionEngine: engine,
      executionIntent: intent,
      debug: hasFlag("--debug"),
      baseUrl: getFlag("--baseUrl"),
      browserName: getFlag("--browser") as any,
      headless,
      slowMoMs: getFlag("--slowMo")
        ? Number(getFlag("--slowMo"))
        : undefined,
      retries: getFlag("--retries")
        ? Number(getFlag("--retries"))
        : undefined
    });
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}