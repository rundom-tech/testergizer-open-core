#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

import { run, RunArgs } from "./run";
import type {
  ExecutionEngine,
  ExecutionIntent,
  ValidationMode
} from "../core/types";

/**
 * CLI entrypoint.
 * Must execute on import.
 * DO NOT export anything from here.
 */

yargs(hideBin(process.argv))
  .command(
    "run <file>",
    "Run a test or suite",
    (y: any) =>
      y
        .positional("file", {
          describe: "Path to suite JSON",
          type: "string",
          demandOption: true
        })
        .option("engine", {
          describe: "Execution engine",
          choices: ["testergizer", "playwright", "api"], // <-- ADDED "api"
          default: "testergizer"
        })
        .option("intent", {
          describe: "Execution intent",
          choices: ["review", "verify", "baseline"]
        })
        .option("debug", {
          describe:
            "Allow debug-only behaviors (e.g., literals inside reusable executables)",
          type: "boolean",
          default: false
        })
        .option("headed", { type: "boolean" })
        .option("headless", { type: "boolean" })
        .option("retries", {
          type: "number",
          describe: "Number of additional attempts after the first",
          demandOption: false,
          coerce: (v: number) => {
            if (!Number.isFinite(v) || v < 0) {
              throw new Error(
                "Invalid value for --retries. Must be a non-negative number."
              );
            }
            return Math.floor(v);
          }
        })
        .option("workers", {
          type: "number",
          describe: "Suite scheduling workers (orchestration parallelism)",
          demandOption: false,
          coerce: (v: number) => {
            if (!Number.isFinite(v) || v < 1) {
              throw new Error(
                "Invalid value for --workers. Must be a positive integer."
              );
            }
            return Math.floor(v);
          }
        })
        .option("slow-mo", { type: "number", alias: "slowMo" })
        .option("base-url", { type: "string", alias: "baseUrl" })
        .option("out", { type: "string" }),
    (args: any) => {
      const headless =
        args.headed === true ? false :
        args.headless === true ? true :
        undefined;

      const engine = args.engine as ExecutionEngine;

      const executionIntent: ExecutionIntent =
        engine === "testergizer"
          ? "review"
          : (args.intent as ExecutionIntent) ?? "verify";

      const validationMode: ValidationMode =
        args.debug ? "debug" : "strict";

      // validationMode is currently derived but not plumbed; kept here to preserve CLI semantics doc.
      void validationMode;

      const runArgs: RunArgs = {
        suitePath: args.file,
        executionEngine: engine,
        executionIntent,
        debug: args.debug,

        headless,
        retries: args.retries,
        slowMoMs: args["slow-mo"],
        baseUrl: args["base-url"],

        workers: args.workers
      };

      run(runArgs).catch((err: Error) => {
        console.error(err.message);
        process.exit(1);
      });
    }
  )
  .demandCommand(1)
  .strict()
  .help()
  .parse();