import test from "node:test";
import assert from "node:assert/strict";

import { validateInterpolationCompleteness } from "../../src/cli/validate";

test("interpolation fails if context var missing", () => {
  const expanded = {
    id: "root.test",
    steps: [{ type: "goto", url: "{{BASE_URL}}" }]
  };

  const issues = validateInterpolationCompleteness({
    doc: expanded,
    contextKeys: new Set(["USERNAME"])
  });

  assert.ok(
    issues.some(
      (i) => i.code === "INTERP_VAR_MISSING" && i.varName === "BASE_URL"
    )
  );
});
