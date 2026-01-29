import test from "node:test";
import assert from "node:assert/strict";

import { validateIncludesAgainstRegistry } from "../../src/cli/validate";

test("root include must target existing reusable", () => {
  const root = {
    id: "root.test",
    steps: [{ type: "include", ref: "auth/login" }]
  };

  const registry = new Map([
    ["auth/login", { id: "auth/login", reusable: true, steps: [] }]
  ]);

  const issues = validateIncludesAgainstRegistry({ doc: root, registry });
  assert.equal(issues.length, 0);
});

test("include fails if target is missing", () => {
  const root = {
    id: "root.test",
    steps: [{ type: "include", ref: "auth/login" }]
  };

  const registry = new Map();

  const issues = validateIncludesAgainstRegistry({ doc: root, registry });
  assert.ok(issues.some((i) => i.code === "INCLUDE_REF_NOT_FOUND"));
});
