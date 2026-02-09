#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-var-requires */
Object.defineProperty(exports, "__esModule", { value: true });
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");
const run_1 = require("./run");
/**
 * CLI entrypoint.
 * Must execute on import.
 * DO NOT export anything from here.
 */
yargs(hideBin(process.argv))
    .command("run <file>", "Run a test or suite", (y) => y
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
    .option("debug", {
    type: "boolean",
    default: false,
    describe: "Allow debug-only behaviors (e.g., literals inside reusable executables)"
})
    .option("out", { type: "string" }), (args) => {
    (0, run_1.run)(args).catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
})
    .demandCommand(1)
    .strict()
    .help()
    .parse();
