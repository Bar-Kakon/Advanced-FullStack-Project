# Backend

Permanent rules for backend work in this repository. They apply to **every backend task and every
backend branch**, from now on, with no expiry. Nothing here changes product or domain behavior — it
governs how backend code is written and how it is explained.

## Backend Function Explanation Rule

Explanations belong in chat, not in the source. Do not add long explanatory comment blocks or JSDoc
written purely to teach the reader what the code does.

After **every** backend implementation task, give a written explanation — outside the code — of every
function that was **created or materially modified**. The purpose is to convey the backend
architecture and request flow without requiring a read of every implementation detail.

For each such function, cover all of the following:

1. **Name** — the function name.
2. **What it does** — the concrete operation it performs.
3. **Why it exists** — the problem it solves; what would break or be duplicated without it.
4. **Where and when it is called** — the call sites and the point in the request/lifecycle flow they
   sit at.
5. **Input** — what it receives, including shape and meaningful constraints.
6. **Output** — what it returns, including error/failure outcomes.
7. **Depends on** — the functions and modules it calls.
8. **Depended on by** — the functions and modules that call it.
9. **Architectural responsibility** — which layer it belongs to (route, controller, service,
   repository, middleware, mapper, validator, and so on).
10. **Business/domain rule enforced** — the exact rule, if the function enforces one.
11. **Why here** — why this responsibility belongs in this function rather than in a neighbouring
    layer or module.

### Not acceptable

Vague, restating labels such as:

- "handles login"
- "validates data"
- "connects to database"

Explain the actual responsibility and the role in the request flow instead.

### Two kinds of function

- **Purely technical functions** — explain the architectural reason the function exists (the coupling
  it removes, the boundary it protects, the duplication it prevents).
- **Business/domain functions** — state the exact rule enforced. Do not invent domain logic that is
  not already specified; if a rule is unclear, say so rather than filling the gap.

## Code Comment Policy

Inside the code:

- Prefer clear naming and small, focused functions over prose.
- Avoid large explanatory comment blocks.
- Keep comments concise, and add them only where they genuinely improve maintainability or where the
  code would otherwise be unclear.
- Do not restate obvious code behavior in a comment.
- Do not use comments as a substitute for clean architecture.

## Engineering Standard

All backend code must continue to prioritize:

- high maintainability
- SOLID principles
- separation of concerns
- low coupling
- high cohesion
- clear responsibilities
- minimal duplication
- **TypeScript only**
