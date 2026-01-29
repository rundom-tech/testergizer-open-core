![CI](https://github.com/rundom-tech/testergizer-open-core/actions/workflows/ci.yml/badge.svg)
[![Codecov](https://codecov.io/gh/rundom-tech/testergizer-open-core/branch/main/graph/badge.svg)](https://codecov.io/gh/rundom-tech/testergizer-open-core)


# Platform Tests

This directory contains **platform-level tests** for Testergizer Open Core.

These tests validate the **engine, contracts, and governance rules** of the platform itself.
They are **not** user test suites and are **not** consumed by Testergizer at runtime.

---

## Test Layers

### 1. Executable / Contract Tests (`tests/executable/`)

Purpose:
- Defend the Executable v1 contract
- Enforce schema, validation, and governance rules

Scope:
- reusable vs root rules
- include semantics
- interpolation completeness
- schema + hard validation rules

Runner:
- Node built-in test runner (`node:test`)

Command:
```bash
npm run test:node
```

Why:

Pure logic

No mocks

No framework lock-in

Fast, deterministic

2. CLI Platform Tests (tests/cli/)

Purpose:

Validate CLI behavior

Validate integration between CLI and core runner

Scope:

command wiring

option handling

file loading

execution modes

Runner:

Vitest (already used in this repository)

3. Core Engine Tests (tests/core/)

Purpose:

Validate core execution engine behavior

Low-level engine correctness

Scope:

runner behavior

execution semantics

deterministic behavior

What These Tests Are NOT

They are not example suites

They are not user-facing artifacts

They are not published or shipped

They do not require Playwright browsers to be installed (unless explicitly stated)

How to Run

Platform contract tests only:

npm run test:node


All platform tests (current default):

npm run test:platform


Build + platform tests (CI / release gate):

npm run test:all

Guiding Rule

If a test lives here, it must answer one question clearly:

“Which platform rule or contract does this test defend?”

Tests that do not defend a rule do not belong here.


---

# 📄 `.github/workflows/ci.yml`  
**COMPLETE FILE — minimal CI wiring**

This wires **`test:all` explicitly**, without changing your existing `test` script behavior.

```yml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "18"

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Platform tests
        run: npm run test:all

```


