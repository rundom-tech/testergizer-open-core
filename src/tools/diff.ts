import fs from "fs";
import path from "path";

type AnyObj = Record<string, any>;

function indexBy<T extends AnyObj>(arr: T[], keyFn: (x: T) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of arr) out[keyFn(item)] = item;
  return out;
}

function testKey(t: AnyObj): string {
  return String(t.id ?? t.name);
}

function lastReason(step: AnyObj): string | null {
  const errs = step?.attemptErrors;
  if (!Array.isArray(errs) || errs.length === 0) return null;
  const last = errs[errs.length - 1];
  return last?.reason ?? null;
}

export function diffResults(aPath: string, bPath: string): AnyObj {
  const a = JSON.parse(fs.readFileSync(aPath, "utf-8"));
  const b = JSON.parse(fs.readFileSync(bPath, "utf-8"));

  const aTests = a.tests ?? [];
  const bTests = b.tests ?? [];
  const aIdx = indexBy(aTests, testKey);
  const bIdx = indexBy(bTests, testKey);

  const allTestKeys = Array.from(new Set([...Object.keys(aIdx), ...Object.keys(bIdx)])).sort();

  const testDiffs: AnyObj[] = [];
  const stepChanges: AnyObj[] = [];

  for (const tk of allTestKeys) {
    const at = aIdx[tk];
    const bt = bIdx[tk];

    if (!at) {
      testDiffs.push({ test: tk, change: "added", status: bt.status });
      continue;
    }
    if (!bt) {
      testDiffs.push({ test: tk, change: "removed", status: at.status });
      continue;
    }

    if (at.status !== bt.status) {
      testDiffs.push({ test: tk, change: "status", from: at.status, to: bt.status });
    }

    const aSteps = at.steps ?? [];
    const bSteps = bt.steps ?? [];
    const aS = indexBy(aSteps, (s) => String(s.id));
    const bS = indexBy(bSteps, (s) => String(s.id));
    const allStepIds = Array.from(new Set([...Object.keys(aS), ...Object.keys(bS)])).sort();

    for (const sid of allStepIds) {
      const as = aS[sid];
      const bs = bS[sid];

      if (!as) {
        stepChanges.push({ key: `${tk}::${sid}`, change: "added", status: bs.status });
        continue;
      }
      if (!bs) {
        stepChanges.push({ key: `${tk}::${sid}`, change: "removed", status: as.status });
        continue;
      }

      if (as.status !== bs.status) {
        stepChanges.push({ key: `${tk}::${sid}`, change: "status", from: as.status, to: bs.status });
      } else if ((as.attempts ?? 1) !== (bs.attempts ?? 1)) {
        stepChanges.push({ key: `${tk}::${sid}`, change: "attempts", from: as.attempts ?? 1, to: bs.attempts ?? 1 });
      }

      const ar = lastReason(as);
      const br = lastReason(bs);
      if (ar && br && ar !== br) {
        stepChanges.push({ key: `${tk}::${sid}`, change: "retry-reason", from: ar, to: br });
      }
    }
  }

  return {
    schemaVersion: "1.0",
    type: "results-diff",
    a: { path: aPath, runId: a.runId, startedAt: a.startedAt },
    b: { path: bPath, runId: b.runId, startedAt: b.startedAt },
    tests: testDiffs,
    steps: stepChanges,
    summary: { testChanges: testDiffs.length, stepChanges: stepChanges.length }
  };
}

export function writeDiff(outPath: string, diff: AnyObj) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
}
