# PHASE_EXECUTION_FREEZE

## REQUIRED — Semantics

- [x] Test-level outcome field name is `result` (not `status`)
- [x] Allowed test results are exactly: `passed | failed | aborted`
- [x] `aborted` replaces any prior `errored` naming
- [x] Step-level status remains `passed | failed` (no `skipped` in Core evidence)

## REQUIRED — Playwright Alignment

- [x] Every test result includes `projectId` (Playwright project semantics)
- [x] For now, `projectId` equals `browserName` (`chromium | firefox | webkit`)
- [x] The run manifest includes `projectId` as:
  - single value if uniform across tests
  - `mixed` otherwise

## REQUIRED — Browser Ownership

- [x] One browser per test (no shared browser across suite)
- [x] Browser is closed in `finally` even on failure/abort

## REQUIRED — Validation Policy

- [x] Every executable (reusable and non-reusable) is validated once on raw JSON
- [x] Reusable executables are validated once when loaded into the registry
- [x] Non-reusable executables are validated once when loaded/executed
- [x] Include expansion is mechanical and is not re-validated as a new executable
- [x] Include references are checked against the registry before expansion
- [x] Interpolation completeness is validated pre-execution

## REQUIRED — Artifact Contract

- [x] `runId` is ISO timestamp (full date + time + ms)
- [x] Folder name reflects full ISO time (colon/dot replaced with dashes)
- [x] Artifacts layout:
  - `artifacts/<suiteId>/<runId>/run.json`
  - `artifacts/<suiteId>/<runId>/<projectId>/<testId>/result.json`
- [x] Every `result.json` contains at least:
  - `suiteId`, `runId`, `projectId`, `testId`, `executionMode`
  - `startedAt`, `endedAt`, `durationMs`
  - `result`
  - `steps`
  - optional `errors` (primarily for `aborted`)
