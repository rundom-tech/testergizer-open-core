# API / REST Testing Expansion — Sprint Development Plan (Open Core)

## Guiding Constraints (Non-Negotiable)
- **Model reuse:** API testing must reuse the same executable model (flows/tests/suites), runner pipeline, and artifact model.
- **Target symmetry:** API targets are referenced by **logical keys** (like CLR keys), not raw URLs by default.
- **Reporting continuity:** API steps must emit **the same StepResult/AttemptResult structures** and render in the **same HTML report** (domain-specific evidence panels only).
- **No new “suite types”:** Keep one Suite model; steps are polymorphic by domain.
- **Delivery style:** Prefer **full-file replacements** per task. If a file is too large, provide an **explicit, line-anchored patch** (“replace lines X–Y with …”) based on evidence from the current repo snapshot.

---

## Implementation Strategy (How we avoid patching pain)
- Each sprint is designed to touch a **small number of files** and to introduce **new small files** rather than editing many existing ones.
- For modifications:
  - Prefer **wrapper/adapter files** that plug into existing entrypoints (e.g., a `StepRouter` module).
  - Prefer **new domain modules** (`src/api/*`) with minimal changes in shared code.
  - If a shared file is large, we will:
    - either provide a **full replacement** if manageable,
    - or an **explicit patch with exact anchors** (function name + surrounding lines) taken from the repo snapshot you provide.

---

# Sprint 0 — Contract & Schema Freeze (No execution yet)
## Objective
Lock the minimal API model shape and repository structure so implementation does not thrash.

## Deliverables
- `docs/API_CONTRACT.md`:
  - Step type: `api.request`
  - Target shape: `{ kind: "api", endpointKey: string }`
  - Endpoint repo shape (dictionary by key)
  - Evidence payload shape for reporting
  - Variable substitution requirements (`${vars.*}`, `${params.*}`)
  - Redaction rules (headers/body field allowlist/denylist)
- Type definitions (if you keep schemas/types in `src/types/*`):
  - `ApiEndpointDefinition`
  - `ApiRequestStep`
  - `ApiEvidence`

## Testing Session (Evidence)
- Schema validation only:
  - Example `apiRepo.json`
  - Example executable JSON using `api.request`
  - `npm run build` passes
  - Optional: JSON schema validation script (if you already have one)

## Acceptance Criteria
- Contract document reviewed and frozen.
- TypeScript build passes without runtime integration.

---

# Sprint 1 — Endpoint Repo Load + Resolver (API “CLR” Equivalent)
## Objective
Load an API endpoint repository at runtime and resolve `endpointKey → {method,url,defaults…}`.

## Deliverables
- New module: `src/api/ApiEndpointRepo.ts` (loader + resolver)
- New types: `src/api/apiTypes.ts` (small, local)
- CLI/config plumbing (minimal):
  - Add optional `--api-repo <path>` or reuse existing “repo inputs” mechanism if present.
  - Runner options extended to carry `apiRepoPath?`

## Testing Session (Evidence)
- Add a minimal node script or test harness:
  - Load `apiRepo.json`
  - Resolve a known key
  - Assert resolved method/url/defaults
- `npm run build` and `npm test` (if tests exist)

## Acceptance Criteria
- Endpoint repo loads deterministically and resolves keys.
- Missing key produces a structured error compatible with your StepResult error model.

---

# Sprint 2 — Core Execution: `api.request` Step (GET/POST + basic expectations)
## Objective
Execute real HTTP/HTTPS requests as steps with the same step pipeline semantics as UI steps.

## Deliverables
- New module: `src/api/ApiClient.ts` (fetch/undici wrapper)
- New module: `src/api/ApiStepRunner.ts`:
  - Build request from endpoint defaults + step overrides
  - Resolve path params / query params
  - Apply variable substitution
  - Execute request
  - Validate expectations:
    - `expect.status` (required MVP)
    - `expect.json` minimal operators (`$exists`, `$eq`) (optional in this sprint if time)
  - Emit `StepResult` with `evidence.api` attached
- Minimal router integration:
  - One place in your step execution switch/dispatcher to route `api.request → ApiStepRunner`

## Testing Session (Evidence)
- Local test server (deterministic):
  - Add `scripts/test-api-server.ts` (tiny http server) OR use a test dependency you already use.
- Add 2 executables:
  - GET success
  - POST echo + status check
- Evidence artifacts:
  - Run output JSON includes step evidence
  - `npm run build` + a documented run command produces passing run

## Acceptance Criteria
- `api.request` works end-to-end locally without external dependencies.
- Failure modes (timeout, non-2xx, invalid JSON) create deterministic errors.

---

# Sprint 3 — Reporting: Render API Evidence in HTML Report
## Objective
Extend HTML reporting to render API steps with semantic-first keys (endpointKey primary, URL/method as details) and collapsible evidence.

## Deliverables
- Report renderer update:
  - Detect step domain/type `api.request`
  - Render header line with:
    - `endpointKey` (primary)
    - badge/status (existing)
    - duration (existing)
  - Collapsible panel:
    - Request: method, resolved URL, headers (redacted), body (redacted/truncated)
    - Response: status, headers (redacted), body preview (truncated), JSON parse info
- Redaction implementation (MVP):
  - Always redact `authorization`, `cookie`, `set-cookie`
  - Optional configurable additional keys list

## Testing Session (Evidence)
- Run Sprint 2 executables and verify:
  - HTML report shows endpointKey (not raw URL as primary)
  - Evidence panel contains request/response with redactions
  - Large body is truncated deterministically

## Acceptance Criteria
- Report remains stable for UI suites.
- API steps appear correctly with evidence and no regressions.

---

# Sprint 4 — Reusables & Hybrid Flow Proof (UI + API in one flow)
## Objective
Prove that reusables and hybrid flows work with no new concepts and that variable propagation works across domains.

## Deliverables
- 1 reusable flow `api.login` (mock server token)
- 1 hybrid test:
  - UI step(s) (can be minimal “no-op” if your UI requires a real page, or use a tiny local HTML fixture)
  - API call saves `vars.token`
  - Subsequent API call uses `Authorization: Bearer ${vars.token}`
  - Final assertion (API status or UI assertion)
- Any missing variable substitution hooks implemented (if not already present)

## Testing Session (Evidence)
- Single suite run producing:
  - run.json with mixed steps
  - HTML report shows step tree (flow → steps) with both domains
  - Clear evidence that `${vars.token}` was applied (without leaking secret)

## Acceptance Criteria
- Reusable invocation works unchanged.
- Cross-domain vars work.

---

# Sprint 5 — Expectations Upgrade: JSONPath extract + richer matchers (Still Core)
## Objective
Improve assertion power without changing orchestration.

## Deliverables
- JSON extraction:
  - `save.vars: { token: "$.token" }` (solidify)
- `expect.json` matcher set (minimal but useful):
  - `$exists`, `$eq`, `$contains`, `$regex` (string), `$type`
- Better error messages:
  - path not found vs mismatch
  - include actual snippet (truncated) in evidence

## Testing Session (Evidence)
- Add 3 API executables to cover matcher cases.
- Report shows assertion failures with clear diagnostics.

## Acceptance Criteria
- Deterministic matcher behavior
- Failure messages actionable

---

# Sprint 6 — Config Profiles (Auth, Base URLs) + Environment Switching
## Objective
Make API tests usable across environments without rewriting executables.

## Deliverables
- API endpoint repo supports:
  - `baseUrlKey` indirection or `${env.API_BASE_URL}`
  - Named header bundles (profiles)
- Runner supports `--env <name>` (if you already have env notion) or `--vars-file`
- Redaction config file support (optional)

## Testing Session (Evidence)
- Same suite runs against two base URLs (two local servers/ports) by switching env config.
- Artifacts demonstrate correct resolved URL per run.

## Acceptance Criteria
- No executable changes needed for environment switch.
- Evidence shows resolved URL (but semantic-first remains endpointKey).

---

# Sprint 7 — CI Hardening (timeouts, retries policy hooks, deterministic truncation)
## Objective
Stabilize runtime characteristics for CI.

## Deliverables
- Timeouts:
  - endpoint default `timeoutMs`
  - step override
- Deterministic truncation limits for request/response
- Optional: retry hook (disabled by default) but structured for future governance

## Testing Session (Evidence)
- Simulated slow endpoint triggers timeout deterministically.
- Report shows timeout reason and evidence.

## Acceptance Criteria
- Predictable failure modes
- No flaky timing in local tests

---

## Sprint Output Template (What you receive each sprint)
- **Objectives** met checklist
- **Files delivered**:
  - Prefer: full files (new + modified)
  - Otherwise: explicit anchored patch (function-level + line ranges from your snapshot)
- **Run instructions** (exact commands)
- **Evidence list**:
  - build output
  - test output
  - artifact paths to inspect (run.json, report.html, etc.)
- **Proposed commit message**
- **CHANGELOG.md entry** (draft)

---

## Suggested Commit Message Pattern
- `feat(api): add endpoint repo loader`
- `feat(api): implement api.request step runner`
- `feat(report): render api evidence panels`
- `test(api): add deterministic local api server fixtures`

---

## Risk Controls (Known pitfalls)
- Avoid external APIs in tests: always use a local deterministic server.
- Redaction must be in place before real-world usage.
- Keep endpointKey semantic-first to avoid report noise and drift.

---