# Testergizer Open Core (Maestro)
### A RunDOM Technologies Project

Testergizer Open Core is a schema-first execution engine for producing deterministic, auditable evidence about system behavior. It serves as the physical foundation of the Quality Intelligence (QI) paradigm.

Execution contracts are defined using a modular, schema-driven architecture consisting of distinct JSON file types:
* Suites: The orchestration layer defining the execution scope, target matrix, and environment.
* Tests: The primary execution threads combining steps across multiple architectural boundaries.
* Reusables: Composable, parameterized step sequences for standardizing common workflows.
* CTR (Central Target Registry): The registry governing physical locators, context subscriptions, and API endpoints.

Execution produces immutable result artifacts that can be validated, compared, and analyzed across time.

---

## Quick Start (Beta v1.1.0)

### Install Official Scoped Package
To ensure you are using the official version maintained by RunDOM Technologies, install using the scoped name:
```bash
npm install -g @rundom-tech/testergizer-open-core
npx playwright install
```

### Verify the installation
```bash
testergizer --version
testergizer --help
```

## Full Stack Quality Intelligence
Testergizer enforces true Quality Intelligence by evaluating the system exactly how it operates in reality: as a connected matrix.

Using a 5-Layer Execution Matrix, the Maestro engine can seamlessly traverse and assert against distinct architectural boundaries using bitwise routing:

* UI (00001): Context-aware DOM traversal and interaction via Playwright.
* API (00010): Direct HTTP interactions, header resolution, and payload assertions.
* FS (00100): File system auditing and validation (Beta).
* DB (01000): Direct database query resolution (Upcoming).
* EMAIL (10000): Asynchronous message interception (Upcoming).

By defining execution contracts that combine UI workflows with API seeding and FS validation, you can decouple business intent from execution logic.

## Verified Examples
The Open Core repository includes verified examples demonstrating the paradigm in action:

* v2-api-variance: Demonstrates decoupled API boundary testing using JSON data matrices and extraction chaining.
* v2-demosauce: Showcases the elimination of the Page Object Model (POM) via the CTR and matrix-driven UI authentication.

To run the examples:
```bash
testergizer run examples/v2-api-variance/suites/suite.api.json --engine playwright --workers 3 --intent verify --autVersion="1.1.0"
```

## Design Principles
Testergizer Open Core is built around the following principles:

* Evidence, not interpretation: The Open Core produces factual execution records.
* Deterministic by default: The execution triad decouples structural validation from real system interaction.
* Schema-first contracts: Both test suites and execution results are governed by strict JSON schemas.
* CTR-Centric: All physical locators and endpoints are abstracted into the Central Target Registry to ensure test logic remains blind to implementation details.

## HTML Reports & Runtime Artifacts
Testergizer Open Core produces a rich, self-contained HTML report for every run session.

* run.json: The canonical, machine-readable run result.
* report.html: A static, portable human-readable report derived from the execution data.
* Traceability: On failure, Playwright traces and video recordings are automatically indexed as evidence.

## Documentation
For the full User Manual, Wiki, and in-depth architectural discussions, please visit:
https://github.com/rundom-tech/testergizer-open-core/wiki

## License
Testergizer Open Core is licensed under the Apache License, Version 2.0.
© 2026 RunDOM Technologies. All rights reserved.