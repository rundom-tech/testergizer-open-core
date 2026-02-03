#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");

import { run, RunArgs } from "./run";

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
          describe: "Path to suite or test JSON",
          type: "string",
          demandOption: true
        })
        .option("mode", {
          choices: ["stub", "execute", "baseline"],
          default: "stub"
        })
        .option("headed", { type: "boolean" })
        .option("headless", { type: "boolean" })
        .option("slow-mo", { type: "number", alias: "slowMo" })
        .option("base-url", { type: "string", alias: "baseUrl" })
        .option("out", { type: "string" }),
    (args: RunArgs) => {
      run(args).catch((err: Error) => {
        console.error(err.message);
        process.exit(1);
      });
    }
  )
  .demandCommand(1)
  .strict()
  .help()
  .parse();
