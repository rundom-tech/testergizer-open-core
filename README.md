# Testergizer Open Core

**Testergizer Open Core** is a schema-first execution engine for producing **deterministic, auditable evidence** about system behavior.

Tests are defined as structured JSON suites.  
Execution produces immutable result artifacts that can be validated, compared, and analyzed across time.

The Open Core intentionally focuses on **execution correctness, traceability, and evidence integrity**.  
Convenience layers, visualization, and higher-level productivity tooling are intentionally out of scope.

---

## Design principles

Testergizer Open Core is built around the following principles:

- **Evidence, not interpretation**  
  The Open Core produces factual execution records. Meaning and intent are layered on top, not embedded.

- **Deterministic by default**  
  Execution modes decouple structural validation from real system interaction.

- **Schema-first contracts**  
  Both test suites and execution results are governed by strict JSON schemas.

- **Execution as a lifecycle**  
  A run is an auditable process with timing, status, execution mode, and domain awareness.

- **Mixed-domain by design**  
  A single flow may span UI, API, filesystem, or other operational domains.

---

## Documentation

Design notes and architectural discussions are being consolidated in the GitHub Wiki:

https://github.com/rundom-tech/testergizer-open-core/wiki

This README documents the **core execution and evidence model**.  
Detailed CLI flags and extended operational usage are intentionally documented in the Wiki.

---

## Quick start (npm)

### Install Testergizer Open Core globally

```bash
npm install -g testergizer-open-core
npx playwright install
```

### Verify the installation

```bash
testergizer --help
```

Check the installed version:

```bash
npm view testergizer-open-core version
```

---

## Execution model

Testergizer executes test suites through an explicit **execution mode**.

Execution mode is **part of the execution contract** and is recorded in the results artifact.

### Supported execution modes

| Mode | Purpose |
|-----|--------|
| `stub` | Deterministic structural execution. |
| `execute` | Real execution against the target system. |
| `verify` | Reserved for future deterministic verification modes. |
| `update` | Reserved for future baseline update flows. |

---

## Configuration scope

Execution behavior is configurable through **explicit, bounded configuration**.

---

## License

Testergizer Open Core is licensed under the Apache License, Version 2.0.
