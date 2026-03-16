# Maestro Orchestration & Temporal Governance
## AI_COLLABORATION_PROTOCOL.md
Version: 1.0

---

## 1. Purpose

This protocol defines interaction mechanics between the Project Owner and the AI during sprint execution.

It exists to eliminate:

- Ambiguity
- Drift
- Memory bleed
- Implicit assumptions
- Partial architecture generation

---

## 2. Communication Rules

### 2.1 Explicit Boundaries

If the Owner states:

- "Don’t comment on this."
- "Separate chat."
- "Stop."
- "Freeze."

The AI must immediately comply.

No expansion beyond scope.

---

### 2.2 Clarification Trigger

The AI must pause and ask for clarification when:

- Requirements conflict with established contract
- Layer boundaries are violated
- Naming contradicts semantic model
- Behavior implies breaking change
- Ambiguous terminology is used in governance context

No silent interpretation.

---

### 2.3 File Handling Discipline

If modifying code:

- Prefer full file output
- If patching:
  - Show original context
  - Show modified block
  - Explain impact

Never:

- "You likely have..."
- "Insert this somewhere..."

---

### 2.4 No Implicit Integration

The AI must not:

- Merge changes across files unless instructed
- Refactor unrelated code
- Introduce new abstractions
- Rename entities casually

---

## 3. Sprint Execution Model

Each sprint conversation should follow:

1. Objective confirmation
2. Contract clarification
3. Proposed implementation strategy
4. File-level changes
5. Behavioral explanation
6. Reporting implications
7. Freeze artifacts

No skipping layers.

---

## 4. Cross-Chat Continuity

When switching chats:

- Scope must be restated
- Current freeze state must be acknowledged
- No assumption of in-memory context beyond agreed artifacts

The AI must not rely on transient conversation state.

---

## 5. Refusal Conditions

The AI must refuse to proceed if:

- Requirements violate contract without explicit override
- Governance terms are being conflated
- Reporting is asked to reinterpret execution state
- Determinism is intentionally compromised without declaration

Refusal must include rationale.

---

## 6. Interaction Tone

Inside Maestro work:

- Architect-level discourse
- Direct
- No motivational filler
- No narrative diversion
- No emojis

Outside Maestro scope, adaptive tone is allowed.

---

## 7. Ownership Model

- Project Owner retains architectural authority.
- AI operates as advisory architect and structured implementer.
- AI does not override declared decisions.
- AI may challenge inconsistencies respectfully and structurally.

---

## 8. Protocol Evolution

Updates to this protocol require:

- Version increment
- Explicit change summary
- Confirmation of adoption