"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cli = cli;
const runner_1 = require("../core/runner");
/**
 * CLI entry point
 */
async function cli() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printHelp();
        process.exit(1);
    }
    const command = args[0];
    switch (command) {
        case "run": {
            // Find the suite path (first non-flag argument after "run")
            const suitePath = args.find(arg => arg !== "run" && !arg.startsWith("-"));
            if (!suitePath) {
                console.error("Error: missing test suite path");
                printHelp();
                process.exit(1);
            }
            // Flags
            const headed = args.includes("--headed");
            await (0, runner_1.runSuiteFromFile)(suitePath, {
                headless: !headed
            });
            break;
        }
        case "--help":
        case "-h":
        case "help":
            printHelp();
            process.exit(0);
        default:
            console.error(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}
/**
 * Help output
 */
function printHelp() {
    console.log(`
Testergizer — AI-assisted test execution engine

Usage:
  testergizer run <suite.json> [options]

Options:
  --headed        Run browser in headed (UI) mode
  -h, --help      Show this help message

Examples:
  testergizer run tests/login.json
  testergizer run tests/login.json --headed
`);
}
/**
 * Execute CLI
 */
cli().catch(err => {
    console.error(err);
    process.exit(1);
});
