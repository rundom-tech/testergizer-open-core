# Testergizer Open Core

**Testergizer Open Core** is a schema-first execution engine for producing deterministic, auditable evidence about system behavior.

Execution contracts are defined using a modular, schema-driven architecture consisting of distinct JSON file types:
* **Suites:** The orchestration layer defining the execution scope, target matrix, and environment.
* **Tests:** The primary execution threads combining steps across multiple architectural boundaries.
* **Reusables:** Composable, parameterized step sequences for standardizing common workflows.
* **CTR:** The Central Target Registry governing physical locators, context subscriptions, and API endpoints.

Execution produces immutable result artifacts that can be validated, compared, and analyzed across time.

The Open Core intentionally focuses on execution correctness, traceability, and evidence integrity. Convenience layers, visualization, and higher-level productivity tooling are intentionally out of scope.

---

## Quick start (npm)

### Install Testergizer Open Core globally

    npm install -g testergizer-open-core
    npx playwright install

### Verify the installation

    testergizer --help

Check the installed version:

    npm view testergizer-open-core version

---

## Full Stack Quality Intelligence

Testergizer enforces true Quality Intelligence by evaluating the system exactly how it operates in reality: as a connected matrix. 

Using a 5-Layer Execution Matrix, a single orchestrator session can seamlessly traverse and assert against distinct architectural boundaries using bitwise routing:
* **UI (00001):** Context-aware DOM traversal and interaction via Playwright.
* **API (00010):** Direct HTTP interactions, header resolution, and payload assertions.
* **FS (00100):** File system auditing and validation.
* **DB (01000):** Direct database query resolution.
* **EMAIL (10000):** Asynchronous message interception.

By defining execution contracts that combine UI workflows with API seeding and Open Core backend stubs, you can decouple business intent from execution logic. Reusable components handle the low-level bitwise routing, ensuring every release maintains a mathematically proven chain of trust across the entire stack.

---

## Design principles

Testergizer Open Core is built around the following principles:

* **Evidence, not interpretation:** The Open Core produces factual execution records. Meaning and intent are layered on top, not embedded.
* **Deterministic by default:** The execution triad decouples structural validation from real system interaction.
* **Schema-first contracts:** Both test suites and execution results are governed by strict JSON schemas.
* **Execution as a lifecycle:** A run is an auditable process with timing, status, execution state, and boundary awareness.
* **Cross-layer by design:** A single flow may span UI, API, database, filesystem, or email architectural layers seamlessly.

---

## Execution Triad

Testergizer executes test suites through a strict, three-part configuration model. This triad is part of the execution contract and is permanently recorded in the results artifact.

### 1. Execution Engine (executionEngine)
Defines the physical driver resolving the steps.
* `playwright`: Real UI execution against the target browser system.
* `api`: Direct REST API routing and payload resolution.
* `testergizer`: Deterministic model execution (dry-run) for structural validation without real-world side effects.

### 2. Execution Intent (executionIntent)
Defines the business goal of the session.
* `verify`: Standard execution asserting against the physical state.
* `review`: Structural review and compilation check.
* `baseline`: Reserved for state-capturing and baseline update flows.

### 3. Validation Mode (validationMode)
Dictates the strictness of the structural governance during the run.
* `strict`: Enforces absolute schema compliance and CTR rules.
* `debug`: Relaxed validation intended strictly for local authoring and troubleshooting.

---

## Central Target Registry (CTR)

Testergizer uses a Central Target Registry (CTR) to formalize the relationship between logical test targets and the Application Under Test (AUT).

The CTR centralizes:
* Logical locator definitions and context subscriptions.
* Ordered resolution strategies and cascading selectors.
* API endpoint mapping.
* Version compatibility rules.
* Structural governance signals.

Locator resolution is deterministic and fully traceable. Adaptive or heuristic behavior, if enabled, is implemented as an explicit AddOn and is never silent.

For design principles and architectural boundaries, see docs/CTR_INTENT.md.

---

## HTML Reports & Runtime Artifacts (Phase 2)

Testergizer Open Core produces a rich, self-contained HTML report for every run session.

### What is generated
For each run:
* `run.json`: the canonical run result
* `artifacts.json`: an append-only evidence index
* `report.html`: the derived human-readable report

On failure only:
* Playwright trace (trace.zip)
* Video recording
* Step-level screenshots

### Artifact principles
* Artifacts are optional and non-intrusive.
* No artifacts are produced on successful attempts.
* Artifacts never affect execution semantics.
* Evidence is append-only and deterministic.

### HTML report
The HTML report:
* Is fully static and self-contained.
* Links directly to raw evidence.
* Opens evidence in new tabs.
* Does not perform inference or aggregation.
* Is derived entirely from run.json and artifacts.json.

### Accessing the report
At the end of execution, Testergizer prints a canonical file URL:

    file:///absolute/path/to/report.html

This URL is portable across platforms and can be opened in any browser.

### Scope
Phase 2 supports:
* Single run session
* Single project and browser
* No cross-run comparison

Trend analysis, cross-run aggregation, and advanced visualizations are intentionally outside the scope of the Open Core. These capabilities belong to the higher-level observability and management layers of the platform ecosystem.

---

## Configuration

Execution behavior is controlled strictly through standard CLI flags or a configuration file.

---

## Documentation

Design notes and architectural discussions are being consolidated in the GitHub Wiki:

https://github.com/rundom-tech/testergizer-open-core/wiki

This README documents the core execution and evidence model. Detailed CLI flags and extended operational usage are intentionally documented in the Wiki.

---

## License

Testergizer Open Core is licensed under the Apache License, Version 2.0.