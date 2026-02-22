import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { runSuiteFromFile } from "../../src/cli/runSuiteFromFile";

const CWD = process.cwd();

describe("runSuiteFromFile (stub mode)", () => {
  const tmpDir = path.join(CWD, "artifacts", "__vitest_tmp__");

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes results artifact and returns runResult", async () => {
    const suitePath = path.join(CWD, "tests", "fixtures", "demosauce-e2e.json");
    const { runResult, outPath } = await runSuiteFromFile(suitePath, {
      executionEngine: "testergizer",
      artifactsDir: tmpDir,
    });

    expect(runResult.suiteId).toBe("demosauce-e2e");
    expect(outPath.startsWith(tmpDir)).toBe(true);
    expect(fs.existsSync(outPath)).toBe(true);

    const written = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    expect(written.schemaVersion).toBe("v1");
    expect(written.summary.total).toBe(2);
  });
});
