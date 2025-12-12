
import fs from "fs";
import path from "path";

type AnyObj = Record<string, any>;

function indexBy<T extends AnyObj>(arr: T[], keyFn: (x: T) => string) {
  const out: Record<string, T> = {};
  for (const item of arr) out[keyFn(item)] = item;
  return out;
}

function testKey(t: AnyObj): string {
  return String(t.id ?? t.name);
}

export function diffResults(aPath: string, bPath: string) {
  const a = JSON.parse(fs.readFileSync(aPath, "utf-8"));
  const b = JSON.parse(fs.readFileSync(bPath, "utf-8"));

  const aTests = indexBy(a.tests ?? [], testKey);
  const bTests = indexBy(b.tests ?? [], testKey);

  const testChanges: any[] = [];
  const stepChanges: any[] = [];

  for (const key of new Set([...Object.keys(aTests), ...Object.keys(bTests)])) {
    const at = aTests[key];
    const bt = bTests[key];

    if (!at || !bt) {
      testChanges.push({ test: key, change: at ? "removed" : "added" });
      continue;
    }

    if (at.status !== bt.status) {
      testChanges.push({
        test: key,
        change: "status",
        from: at.status,
        to: bt.status
      });
    }

    const aSteps = indexBy(at.steps ?? [], s => s.id);
    const bSteps = indexBy(bt.steps ?? [], s => s.id);

    for (const sid of new Set([...Object.keys(aSteps), ...Object.keys(bSteps)])) {
      const as = aSteps[sid];
      const bs = bSteps[sid];

      if (!as || !bs) {
        stepChanges.push({ step: `${key}::${sid}`, change: as ? "removed" : "added" });
        continue;
      }

      if (as.status !== bs.status) {
        stepChanges.push({
          step: `${key}::${sid}`,
          change: "status",
          from: as.status,
          to: bs.status
        });
      }
    }
  }

  return {
    schemaVersion: "1.0",
    type: "results-diff",
    tests: testChanges,
    steps: stepChanges
  };
}

export function writeDiff(outPath: string, diff: any) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(diff, null, 2), "utf-8");
}
