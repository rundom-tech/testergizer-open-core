import fs from "fs";
import path from "path";

import { CoreRunner } from "../core/CoreRunner";
import { JsonTestDefinition } from "../core/types";

import { validateSuite } from "../core/validateSuite";
import { validateResults } from "../core/validateResults";
import { diffResults } from "../tools/diff";
import { detectFlaky } from "../tools/flaky";
import { runSuiteFromFile } from "./runSuiteFromFile";

function sanitizeId(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatTimestamp(iso: string): string {
  const noMs = iso.replace(/\..+/, "").replace(/Z$/, "");
  const parts = noMs.split("T");
  const date = parts[0];
  const time = parts[1];
  if (!date || !time) return String(Date.now());
  return `${date.replace(/-/g, "")}-${time.replace(/:/g, "")}`;
}

function printUsage() {
  console.log(`
Testergizer — AI-assisted test execution engine

Usage:
  testergizer <command> [args] [options]

Commands:
  run <suite.json>                          Run a Testergizer suite
  validate <file.json>                      Validate a suite or results file
  diff <resultsA.json> <resultsB.json>      Diff two results files
  flaky <fileOrDir> [more...]               Detect flaky tests/steps

Run options:
  --headed
  --headless
  --slow-mo <ms>

Diff options:
  --out <path>

Flaky options:
  --out <path>
`);
}

function isSuiteJson(json: any): json is { tests: JsonTestDefinition[] } {
  return json && Array.isArray(json.tests);
}

function isTestJson(json: any): json is JsonTestDefinition {
  return json && Array.isArray(json.steps) && typeof json.id === "string";
}

export function cli() {
  const [, , cmd, ...args] = process.argv;

  if (!cmd) {
    printUsage();
    process.exit(1);
  }

  /* ============================
     RUN
     ============================ */
  if (cmd === "run") {
    const suitePath = args[0];
    if (!suitePath) {
      console.error("Missing suite path");
      process.exit(1);
    }

    runSuiteFromFile(suitePath, {
      executionMode: "stub", // TEMPORARY
      headless: !args.includes("--headed"),
      slowMo: (() => {
        const idx = args.indexOf("--slow-mo");
        return idx >= 0 ? Number(args[idx + 1]) : undefined;
      })(),
    })
      .then(runResult => {
        console.log(JSON.stringify(runResult, null, 2));
      })
      .catch(err => {
        console.error(err);
        process.exit(1);
      });

    return;
  }


  /* ============================
     VALIDATE
     ============================ */
  if (cmd === "validate") {
    const filePath = args[0];
    if (!filePath) {
      console.error("Missing file path");
      process.exit(1);
    }

    let ok = true;
    let validatedType: "suite" | "results" | null = null;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(raw);

      if (json.tests && json.summary) {
        validateResults(json);
        validatedType = "results";
      } else {
        validateSuite(json);
        validatedType = "suite";
      }
    } catch (err) {
      ok = false;
      console.error(err instanceof Error ? err.message : err);
    }

    if (ok && validatedType) {
      console.log(
        validatedType === "results"
          ? "Results schema validation passed"
          : "Suite schema validation passed"
      );
    }

    process.exit(ok ? 0 : 1);
  }

  /* ============================
     DIFF
     ============================ */
  if (cmd === "diff") {
    const [a, b, ...rest] = args;
    if (!a || !b) {
      console.error("Missing results files");
      process.exit(1);
    }

    const outIdx = rest.indexOf("--out");
    const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;

    const diff = diffResults(a, b);

    const suiteIdRaw = diff.suiteId ?? "unknown";
    const suiteId = sanitizeId(suiteIdRaw) || "unknown";
    const ts = formatTimestamp(diff.timestamp ?? new Date().toISOString());

    const outPath = outOverride
      ? path.resolve(process.cwd(), outOverride)
      : path.join("artifacts", suiteId, `diff_${suiteId}_${ts}.json`);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");

    console.log(`Diff written to ${outPath}`);
    return;
  }

  /* ============================
     FLAKY
     ============================ */
  if (cmd === "flaky") {
    const rest = [...args];
    const outIdx = rest.indexOf("--out");
    const outOverride = outIdx >= 0 ? rest[outIdx + 1] : undefined;
    const inputs =
      outIdx >= 0
        ? rest.filter((_, i) => i !== outIdx && i !== outIdx + 1)
        : rest;

    if (inputs.length === 0) {
      console.error("Missing path(s)");
      process.exit(1);
    }

    const analysis = detectFlaky(inputs);

    const suiteIdRaw = analysis.suiteId ?? "unknown";
    const suiteId = sanitizeId(suiteIdRaw) || "unknown";
    const ts = formatTimestamp(analysis.timestamp ?? new Date().toISOString());

    const outPath = outOverride
      ? path.resolve(process.cwd(), outOverride)
      : path.join("artifacts", suiteId, `flaky_${suiteId}_${ts}.json`);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2), "utf-8");

    console.log(`Flaky analysis written to ${outPath}`);
    return;
  }

  printUsage();
  process.exit(1);
}

cli();
