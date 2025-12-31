import fs from "fs";
import path from "path";

/* ---------------------------------- */
/* Types                               */
/* ---------------------------------- */

type StepStatus = "passed" | "failed" | "skipped";

interface StepResult {
  id: string;
  status: StepStatus;
}

interface TestResult {
  id: string;
  status: StepStatus;
  steps: StepResult[];
}

interface RunResult {
  suiteId?: string;
  startedAt?: string;
  tests: TestResult[];
}

interface DiffEntry {
  testId: string;
  stepId?: string;
  statusA: StepStatus | "missing";
  statusB: StepStatus | "missing";
}

export interface DiffResult {
  suiteId?: string;
  timestamp: string;
  differences: DiffEntry[];
}

/* ---------------------------------- */
/* Helpers                             */
/* ---------------------------------- */

function loadResult(filePath: string): RunResult {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function indexResults(files: string[]): Map<string, Map<string | null, StepStatus>> {
  const index = new Map<string, Map<string | null, StepStatus>>();

  for (const file of files) {
    const run = loadResult(file);

    for (const test of run.tests) {
      const testKey = test.id;
      if (!index.has(testKey)) {
        index.set(testKey, new Map());
      }

      // Test-level status (null stepId)
      index.get(testKey)!.set(null, test.status);

      for (const step of test.steps ?? []) {
        index.get(testKey)!.set(step.id, step.status);
      }
    }
  }

  return index;
}

/* ---------------------------------- */
/* Public API                          */
/* ---------------------------------- */

export function diffResults(
  aFiles: string[],
  bFiles: string[]
): DiffResult {
  if (!aFiles.length || !bFiles.length) {
    throw new Error("diffResults requires non-empty file lists");
  }

  const indexA = indexResults(aFiles);
  const indexB = indexResults(bFiles);

  const allTests = new Set<string>([
    ...indexA.keys(),
    ...indexB.keys()
  ]);

  const differences: DiffEntry[] = [];

  for (const testId of allTests) {
    const stepsA = indexA.get(testId) ?? new Map();
    const stepsB = indexB.get(testId) ?? new Map();

    const allSteps = new Set<string | null>([
      ...stepsA.keys(),
      ...stepsB.keys()
    ]);

    for (const stepId of allSteps) {
      const statusA = stepsA.get(stepId) ?? "missing";
      const statusB = stepsB.get(stepId) ?? "missing";

      if (statusA !== statusB) {
        differences.push({
          testId,
          stepId: stepId ?? undefined,
          statusA,
          statusB
        });
      }
    }
  }

  // Try to infer suiteId from first file
  let suiteId: string | undefined;
  try {
    const first = loadResult(aFiles[0]);
    suiteId = first.suiteId;
  } catch {
    suiteId = undefined;
  }

  return {
    suiteId,
    timestamp: new Date().toISOString(),
    differences
  };
}

/* ---------------------------------- */
/* Writer                              */
/* ---------------------------------- */

export function writeDiff(outPath: string, diff: DiffResult): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
}
