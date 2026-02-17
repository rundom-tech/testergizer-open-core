# CLR_INTENT.md

# Compatibility & Locator Registry (CLR)
## Intent & Design Freeze – Testergizer Open Core

---

## 1. Purpose

The Compatibility & Locator Registry (CLR) formalizes the structural contract between:

- Test suites
- Logical targets
- The Application Under Test (AUT)
- The execution environment

CLR centralizes:

- Logical locator definitions
- Ordered locator strategies
- AUT version compatibility rules
- Structural drift signals (future)
- Resolution traceability

CLR strengthens structural awareness without compromising execution determinism.

CLR evaluates and annotates.  
CLR does not silently mutate execution behavior.

---

## 2. Design Philosophy

### 2.1 Deterministic Core

Given the same:

- Suite
- CLRDefinition
- Registered strategy set
- ExecutionType
- Detected runtime inputs

CLR resolution must produce identical results.

Determinism means:

- Fixed strategy ordering
- No random behavior
- No implicit fallback
- No hidden adaptation

---

### 2.2 Practical Resilience

CLR supports ordered multi-strategy resolution.

Fallback is allowed if:

- Strategies are explicitly declared
- Order is fixed
- Attempts are recorded
- Final resolution is surfaced

Resilience is controlled and transparent.

---

### 2.3 Separation of Concerns

CLR:

- Does not access browser/page objects
- Does not perform I/O
- Does not compute environment signals
- Does not call external services
- Does not implement adaptive heuristics

CLR evaluates inputs supplied by CoreRunner.

Adaptive logic belongs outside Core.

---

## 3. Scope (Beta)

### Included

- Logical locator registry
- Ordered strategy resolution
- Strategy registry infrastructure
- Version range validation
- "demo" sentinel for version bypass
- ExecutionType-aware validation
- DOM fingerprint placeholder
- Structured resolution reporting
- Strategy registry audit visibility

### Deferred

- DOM fingerprint computation
- Adaptive locator inference
- LLM-assisted healing
- Governance enforcement policies
- Environment classification

---

## 4. CLRDefinition Structure

```ts
interface CLRDefinition {
  appId: string;

  /**
   * SemVer range or sentinel value "demo"
   */
  versionRange: string;

  /**
   * Optional structural fingerprint (future implementation)
   */
  domFingerprint?: string;

  /**
   * Logical locator registry
   */
  locators: Record<string, LocatorEntry>;
}

```

LocatorEntry:
```ts
interface LocatorEntry {
  contexts: string[];
  strategies: LocatorStrategy[];
  description?: string;
}
```

LocatorStrategy:
```ts
interface LocatorStrategy {
  strategy: string;
  value: unknown;
}
```

Multiple strategies per locator are allowed.
Order is authoritative.

## 5. Execution Context Input

```ts
interface CLRExecutionContext {
  executionType: "live" | "model";
  detectedAutVersion?: string;
  detectedDomFingerprint?: string;
}
```

CLR does not detect these values.
They are supplied by CoreRunner.

## 6. Resolution Semantics
### 6.1 Locator Resolution Flow

target → parseTarget
        → validate context
        → retrieve LocatorEntry
        → iterate strategies in order
        → first successful resolution wins
        → record all attempts

All attempts must be recorded in resolution metadata.

There is no implicit reordering.
There is no silent suppression of failure.

## 6.2 Resolution Attempt Recording

Each attempt records:

- Strategy name
- Outcome (success | failure)
- Error (if any)

Resolution metadata must be surfaced in:

- run.json
- report.html

Transparency is mandatory.

## 7. Strategy Registry
### 7.1 Purpose

StrategyRegistry maps:

strategy name → resolver implementation

Resolution is single-dispatch per attempt.

## 7.2 Registration Rules

- Strategy names must be unique
- Duplicate registration → hard error
- Unregistered strategy reference → hard error
- Invalid payload → structured error

Error codes:
- CLR_STRATEGY_NOT_REGISTERED
- CLR_STRATEGY_DUPLICATE
- CLR_STRATEGY_INVALID_PAYLOAD

## 7.3 Built-in Strategies (Beta)

Core provides:

- css
- xpath
- role
- text
- testId

AddOns may register additional strategies.

## 7.4 Registry Auditability

Each run must record:

```ts
strategyRegistry: {
  registered: string[];
}
```
This ensures reproducibility and transparency.

## 8. Version Validation
executionType = live

If versionRange === "demo":

status = "skipped"

reason = "clr_demo_sentinel"

Else:

Perform SemVer validation

status = "match" | "out_of_range"

executionType = model

Version validation is not applicable.

status = "skipped"

reason = "executionType_model"

## 9. DOM Fingerprint (Beta Placeholder)
executionType = live

If domFingerprint absent:

status = "not_configured"

If present but fingerprinting not implemented:

status = "not_implemented"

executionType = model

status = "skipped"

reason = "executionType_model"

## 10. Adaptive Mode (AddOn Boundary)

Adaptive logic is not part of Core.

Adaptive Mode may:

Attempt additional locator inference

Use heuristics

Interact with an LLM

Propose alternative strategies

If Adaptive Mode is enabled:

It must operate after Core strategies fail

It must log all interventions

It must record model details if LLM-based

It must mark run as adaptive-assisted

Core never silently adapts.

## 11. Determinism Guarantee

Determinism is preserved when:

Strategy order is fixed

Registry is fixed

Adaptive Mode is disabled

If Adaptive Mode is enabled:

Adaptation must be fully surfaced

Reproducibility metadata must be logged

## 12. Non-Goals

CLR does not:

Heal locators silently

Reorder strategies dynamically

Hide incompatibility

Replace DriverEngine logic

Enforce governance policy

## 13. Architectural Position

CLR is implemented as a pre-execution governance layer and deterministic locator engine.

It elevates structural awareness without sacrificing practical resilience.

It separates:

Deterministic Core
from
Probabilistic Adaptive AddOns

## 14. Philosophical Position

Testergizer Core never guesses.

It resolves deterministically and reports transparently.

Adaptation, when enabled, is explicit and auditable.

Confidence comes from structural clarity, not silent healing.

# End of document.

