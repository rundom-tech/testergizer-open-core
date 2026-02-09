# Testergizer Reports

## What a Report Represents
- A report reflects a single suite run
- Tests may be executed, skipped, or invalidated
- Reports are execution facts, not opinions

## Test Statuses
- Passed
- Failed
- Aborted (execution started)
- Skipped (not executed)

> There is no “Invalid” test status.
> Validation errors are shown as aborted tests with reason=validation.

## Skipped Tests
- Defined at the suite level
- Never executed
- Do not produce artifacts
- Always visible in reports

## Debug Semantics
- Debug mode relaxes purity rules
- Debug warnings are shown inline per step
- Reports always disclose when debug semantics were used

## Validation & Invalidation
- Invalid tests do not block the suite
- They are reported transparently
- Execution continues

## Artifacts
- Traces, videos, screenshots are linked directly
- Missing artifacts are expected for skipped tests

## Transparency Guarantees
- Full CLI command is shown
- Working directory is shown
- CI context is disclosed
