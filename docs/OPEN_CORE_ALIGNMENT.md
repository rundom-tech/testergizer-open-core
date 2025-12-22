Open Core emits execution evidence only.

Responsibilities:
- Emit stable, deterministic artifacts
- Declare schemaVersion
- Never perform analysis
- Never support multiple schemas at runtime

Consumers must validate artifacts strictly and fail fast if unsupported.
