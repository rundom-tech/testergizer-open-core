import test from "node:test";
import assert from "node:assert/strict";

import { validateExecutableDoc } from "../../src/cli/validate";

test("reusable cannot define context", () => {
  const doc = {
    id: "auth/login",
    reusable: true,
    context: { BASE_URL: "https://x" },
    steps: []
  };

  const issues = validateExecutableDoc(doc);
  assert.ok(issues.some((i) => i.code === "REUSABLE_CONTEXT_FORBIDDEN"));
});

test("reusable cannot contain include steps", () => {
  const doc = {
    id: "auth/login",
    reusable: true,
    steps: [{ type: "include", ref: "auth/other" }]
  };

  const issues = validateExecutableDoc(doc);
  assert.ok(issues.some((i) => i.code === "REUSABLE_INCLUDE_FORBIDDEN"));
});
