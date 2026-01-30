# Context-Qualified Locator Model (CQLM)

## Definition

Testergizer uses a **Context-Qualified Locator Model** to decouple:

- **Test intent** (where am I, what am I acting on)
- **Locator mechanics** (how an element is found)

without collapsing semantic truth or inflating maintenance cost.

In this model:

- **Context is explicit in the test step**
- **Reuse is declared via context membership**
- **Locators are resolved deterministically**

---

## Target Naming Convention

Test steps reference elements using a fully qualified target:

```
<context>.<logicalName>.<type>
```

Example:

```json
{
  "step": "fill",
  "target": "login.username.input"
}
```

Rules:

- The **first token is always the context**
- Context is never inferred
- Targets are narrative and page-truthful

---

## Locator Dictionary Structure

The locator dictionary is keyed by **element logical identity**, not context.

```json
{
  "username.input": {
    "contexts": ["login"],
    "strategies": [
      { "by": "testId", "value": "username-input" }
    ]
  },

  "submit.button": {
    "contexts": ["login", "settings"],
    "strategies": [
      { "by": "role", "value": "button", "name": "Submit" },
      { "by": "css", "value": "button[type='submit']" }
    ]
  }
}
```

Key properties:

- Reuse is expressed **only** by listing multiple contexts
- No aliases
- No inheritance
- No implicit coupling between unrelated elements

---

## Resolution Semantics

Given a test target:

```
login.submit.button
```

Resolution proceeds as follows:

1. Split target into:
   - `context = "login"`
   - `elementKey = "submit.button"`

2. Load `elementKey` from the dictionary

3. Validate:
   - `context ∈ element.contexts`
   - If not → **hard failure**

4. Resolve locator strategies in declared order

No guessing.  
No cross-context fallback.  
No mutation.

---

## Epistemic Principle

> **Context is asserted by the test, validated by the dictionary, and never inferred by the tool.**

This ensures that tests describe **reality**, not implementation accidents.

---

## Computational Complexity Note

Locator resolution under the Context-Qualified Locator Model is:

- **O(1)** dictionary lookup
- **O(k)** context membership check, where `k` is the number of subscribed contexts (small, bounded)
- **O(m)** strategy resolution, where `m` is the number of locator strategies (small, ordered)

Dictionary growth is **linear**, not combinatorial:

- Reusable elements are defined once
- Context reuse is declared via metadata
- No duplication across contexts

This keeps both runtime execution and maintenance cost minimal.

---

## Summary

> *The Context-Qualified Locator Model preserves semantic truth, centralizes maintenance, and achieves constant-time resolution with linear dictionary growth.*
