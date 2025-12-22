# Schema Validation Errors — Testergizer Contract

This document defines how Testergizer consumers must react to
invalid or unsupported execution artifacts.

## Principles
- Validation is strict
- No fallback behavior
- No partial compatibility
- Errors are actionable

## Error Classes

### MissingSchemaVersion
- schemaVersion field is absent
- Exit code: 32
- Message: Missing schemaVersion. Artifact is invalid.

### UnsupportedSchemaVersion
- schemaVersion is present but unsupported
- Exit code: 32
- Message: Unsupported schemaVersion "<value>". Please migrate the artifact to schema v1.

### InvalidSchemaStructure
- JSON does not conform to schema v1
- Exit code: 32
- Message: Artifact does not conform to schema v1.

## Responsibility Boundary
- Open Core emits valid artifacts
- Pro validates strictly
- Migration is explicit and offline
