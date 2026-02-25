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
    .option("engine", {
    describe: "Execution engine",
    choices: ["testergizer", "playwright"],
    default: "testergizer"
})
    .option("intent", {
    describe: "Execution intent",
    choices: ["review", "verify", "baseline"]
})
    .option("debug", {
    describe: "Allow debug-only behaviors (e.g., literals inside reusable executables)",
    type: "boolean",
    default: false
})
    .option("headed", { type: "boolean" })
    .option("headless", { type: "boolean" })
    .option("retries", {
    type: "number",
    describe: "Number of additional attempts after the first",
    demandOption: false,
    coerce: (v) => {
        if (!Number.isFinite(v) || v < 0) {
            throw new Error("Invalid value for --retries. Must be a non-negative number.");
        }
        return Math.floor(v);
    }
})
    .option("slow-mo", { type: "number", alias: "slowMo" })
    .option("base-url", { type: "string", alias: "baseUrl" })
    .option("out", { type: "string" }), (args) => {
    const headless = args.headed === true ? false :
        args.headless === true ? true :
            undefined;
    const engine = args.engine;
    const executionIntent = engine === "testergizer"
        ? "review"
        : args.intent ?? "verify";
    const validationMode = args.debug ? "debug" : "strict";
    const runArgs = {
        suitePath: args.file,
        executionEngine: engine,
        executionIntent,
        debug: args.debug,
        headless,
        retries: args.retries,
        slowMoMs: args["slow-mo"],
        baseUrl: args["base-url"]
    };
    (0, run_1.run)(runArgs).catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
})
    .demandCommand(1)
    .strict()
    .help()
    .parse();
