# Testergizer Open Core

Open-core engine for Testergizer: JSON test definitions, runner, assertions, CLI, and basic analysis tools.


## Documentation

Design notes, schemas, and architectural decisions are documented in the GitHub Wiki:

https://github.com/rundom-tech/testergizer-open-core/wiki


## Quick start (npm)

### Install Testergizer Open Core globally

```bash
npm install -g testergizer-open-core
npx playwright install
```

### Verify the installation

After installing, you can verify that Testergizer is available on your system:

```bash
testergizer --help
```

If the command prints the Testergizer CLI help, the installation was successful.


You can also check the installed version:
```bash
npm view testergizer-open-core version
```


## Install
```bash
npm install
npx playwright install
```


## Build
```bash
npm run build
```


## Link CLI (development)

```bash
npm link
```


## JSON schemas (v1)

- `schemas/test-suite.v1.json` — test plan (suite)
- `schemas/results.v1.json` — execution output (results)

### Versioning

Suites may include a `version` field. If omitted, the runner assumes `"1.0"`.


## Step IDs (traceability)

Add a stable `id` per step in your suite JSON:

```json
{
  "id": "login-button-value",
  "action": "assert",
  "assert": "valueContains",
  "selector": "#login-button",
  "value": "Login"
}
```

If `id` is omitted, the runner emits fallback IDs: `step-1`, `step-2`, ...


## Run

```bash
testergizer run tests/login.saucedemo.json --headed
testergizer run tests/login.saucedemo.json --headed --slow-mo 200
testergizer run tests/login.saucedemo.json --browser firefox
testergizer run tests/login.saucedemo.json --screenshot-on-fail
```


## Step retries (keyed by step ID)

Retry all steps up to 2 times:

```bash
testergizer run tests/login.saucedemo.json --step-retries 2
```

Retry only selected steps:

```bash
testergizer run tests/login.saucedemo.json --step-retries 2 --retry-steps login-button-value,username-placeholder
```

Optional delay between attempts:

```bash
testergizer run tests/login.saucedemo.json --step-retries 2 --retry-delay-ms 200
```

When a step passes after retries, the results report marks it as:

- `"attempts": >1`
- `"flaky": true`


## Artifacts and results

Each execution produces a **deterministic, append-only results artifact**.

Results are organized per suite and timestamped to support
historical inspection, diffing, and flaky test analysis.

```
artifacts/<suiteId>/results_<YYYYMMDD-HHMMSS>.json
```

Key properties:
- Results are **never overwritten**
- Each suite has its own results directory
- Filenames are derived from the run start time
- Artifacts are safe for CI, automation, and long-term analysis


## Diff two runs (by test/step IDs)

```bash
testergizer diff artifacts/<suiteId>/results_*.json --out artifacts/diff.json
```


## Flaky detection across many runs

```bash
testergizer flaky artifacts/<suiteId>/ --out artifacts/flaky.json
```

A test/step is considered **flaky** if it has at least one pass and one fail across the provided runs.

### Validation

Testergizer includes built-in schema validation for both test suites and results artifacts.

```bash
testergizer validate tests/login.saucedemo.json
testergizer validate artifacts/<suiteId>/results_*.json
```

Validation is intended to enforce contracts in CI pipelines and to
guarantee that generated artifacts remain compatible with analysis tools.


## Scope and boundaries

Testergizer Open Core intentionally focuses on **execution, validation, and analysis**.

Included in Open Core:
- JSON-native test execution
- Strict suite and results schemas
- Deterministic run artifacts
- Step-level retries with failure classification
- CLI tooling for run, validate, diff, and flaky analysis
- CI-first behavior and exit codes

Out of scope for Open Core:
- UI dashboards
- Test recorder
- Visual assertions
- AI-based healing or selector repair
- Cloud or remote execution
- Team management and governance features

For a clear explanation of the Open Core vs commercial boundary, see:  
**[Open Core vs Pro — Scope and Boundaries](PRO-BOUNDARY.md)**

Maintenance policy for the v0.1.x line is documented here:  
**[Open Core Maintenance Policy](MAINTENANCE.md)**


## Contributing

Please read the contribution guidelines in [CONTRIBUTING.md](https://github.com/rundom-tech/testergizer-open-core/blob/main/CONTRIBUTING.md).

Architectural principles, design decisions, and contribution boundaries are documented in the GitHub Wiki.

## License and copyright

Testergizer Open Core is licensed under the **Apache License, Version 2.0**.

- See [LICENSE](LICENSE) for the full license text
- See [NOTICE](NOTICE) for copyright and attribution information
