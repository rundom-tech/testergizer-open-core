# Central Locators Repository (CLR)

The Central Locators Repository (CLR) is a project-level asset that defines **stable, reusable UI locators**.

## What the CLR is
- A dictionary of named locators
- Pure data (no logic, no flow, no assertions)
- Referenced by executables and test suites
- Shared across tests and flows

## What the CLR is NOT
- Not a test
- Not an executable
- Not a fixture
- Not owned by a single test

## Design rules
- Locators must be named by **intent**, not by selector shape
- Locators should change **less frequently** than executables
- Executables MUST reference locators by key, never inline selectors
- Tests MUST NOT define selectors inline

## Stability contract
Changes to CLR entries may impact multiple executables and suites.
Treat CLR updates as **breaking changes** unless proven otherwise.

## Studio implications
- CLR files are first-class editable assets
- Schema validation is mandatory
- Referential integrity must be enforced
