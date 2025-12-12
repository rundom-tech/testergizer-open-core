
import fs from "fs";
import path from "path";

type AnyObj = Record<string, any>;

function testKey(t: AnyObj): string {
  return String(t.id ?? t.name);
}

export function resolveInputs(inputs: string[]): string[] {
  const out: string[] = [];
  for (const inp of inputs) {
    const p = path.resolve(inp);
    if (!fs.existsSync(p)) continue;

    if (fs.statSync(p).isFile()) out.push(p);
    else {
      for (const f of fs.readdirSync(p)) {
        if (f.endsWith(".json")) out.push(path.join(p, f));
      }
    }
  }
  return Array.from(new Set(out));
}

export function detectFlaky(paths: string[]) {
  const runs = paths.map(p => JSON.parse(fs.readFileSync(p, "utf-8")));
  const stepStats: Record<string, { pass: number; fail: number }> = {};

  for (const r of runs) {
    for (const t of r.tests ?? []) {
      const tk = testKey(t);
      for (const s of t.steps ?? []) {
        const key = `${tk}::${s.id}`;
        stepStats[key] ??= { pass: 0, fail: 0 };
        s.status === "passed" ? stepStats[key].pass++ : stepStats[key].fail++;
      }
    }
  }

  const flaky = Object.entries(stepStats)
    .filter(([_, v]) => v.pass > 0 && v.fail > 0)
    .map(([k, v]) => ({
      step: k,
      passes: v.pass,
      fails: v.fail,
      failRate: v.fail / (v.pass + v.fail)
    }));

  return {
    schemaVersion: "1.0",
    type: "flaky-analysis",
    runs: runs.length,
    flaky
  };
}
