#!/usr/bin/env bash

# ============================================================
# ORCHESTRATION DETERMINISM MATRIX
# Root-level script
#
# Validates:
# - CPU fallback (no --workers)
# - Explicit workers (1,2,4,8)
# - Sequential vs parallel structural parity
# - Deterministic ordering
# - CTR fail-fast
# - v1 schema rejection
#
# Engine: testergizer (review only)
# ============================================================

set +e

ENGINE="testergizer"
INTENT="review"
SUITE="examples/v2-demosauce/suites/suite.demosauce-e2e-debug-full-ctr.json"
OUT_ROOT="artifacts/orch-matrix"

WORKER_SET=("cpu" 1 2 4 8)

declare -A RESULTS
declare -A HASHES

mkdir -p "$OUT_ROOT"

RUN=1

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

function banner() {
  echo ""
  echo "=============================================================="
  echo "RUN #$RUN"
  echo "ENGINE: $ENGINE"
  echo "INTENT: $INTENT"
  echo "WORKERS: $1"
  echo "OUT: $2"
  echo "=============================================================="
  echo ""
}

function extract_structural_hash() {
  JSON_FILE="$1"

  # Extract ordered test IDs from JSON report.
  # Adjust this jq path if your reporter structure differs.

  jq '[.tests[].testId]' "$JSON_FILE" \
    | sha256sum \
    | awk '{print $1}'
}

function run_case() {
  WORKER_MODE=$1

  TAG="$WORKER_MODE"
  OUT_DIR="$OUT_ROOT/$TAG"
  mkdir -p "$OUT_DIR"

  banner "$WORKER_MODE" "$OUT_DIR"

  if [ "$WORKER_MODE" = "cpu" ]; then
    CMD="testergizer run \"$SUITE\" \
      --engine $ENGINE \
      --intent $INTENT \
      --out \"$OUT_DIR\""
  else
    CMD="testergizer run \"$SUITE\" \
      --engine $ENGINE \
      --intent $INTENT \
      --workers $WORKER_MODE \
      --out \"$OUT_DIR\""
  fi

  echo "$CMD"
  eval $CMD
  EXIT_CODE=$?

  RESULTS["$TAG"]=$EXIT_CODE

  JSON_REPORT=$(find "$OUT_DIR" -name "*.json" | head -n 1)

  if [ -f "$JSON_REPORT" ]; then
    HASH=$(extract_structural_hash "$JSON_REPORT")
    HASHES["$TAG"]=$HASH
  else
    HASHES["$TAG"]="NO_REPORT"
  fi

  RUN=$((RUN+1))
}

# ------------------------------------------------------------
# Parallelism Matrix
# ------------------------------------------------------------

for W in "${WORKER_SET[@]}"; do
  run_case "$W"
done

# ------------------------------------------------------------
# Determinism Parity Check
# ------------------------------------------------------------

echo ""
echo "================ STRUCTURAL PARITY CHECK ================"

BASE_HASH="${HASHES[cpu]}"

for W in "${WORKER_SET[@]}"; do
  CURRENT_HASH="${HASHES[$W]}"
  if [ "$CURRENT_HASH" != "$BASE_HASH" ]; then
    echo "ORDER MISMATCH: workers=$W"
    echo "  cpu hash: $BASE_HASH"
    echo "  $W hash : $CURRENT_HASH"
  else
    echo "Parity OK: workers=$W"
  fi
done

# ------------------------------------------------------------
# CTR FAIL-FAST TEST
# ------------------------------------------------------------

echo ""
echo "================ CTR FAIL-FAST TEST ================"

BAD_CTR_SUITE="examples/v2-demosauce/suites/suite.demosauce-e2e-debug.json"

testergizer run "$BAD_CTR_SUITE" \
  --engine "$ENGINE" \
  --intent "$INTENT"

if [ $? -eq 0 ]; then
  echo "FAIL: Missing CTR did not fail"
else
  echo "PASS: Missing CTR failed correctly"
fi

# ------------------------------------------------------------
# V1 REJECTION TEST
# ------------------------------------------------------------

echo ""
echo "================ V1 REJECTION TEST ================"

V1_SUITE="examples/v1-demosauce/demosauce-e2e-exp.json"

testergizer run "$V1_SUITE" \
  --engine "$ENGINE" \
  --intent "$INTENT"

if [ $? -eq 0 ]; then
  echo "FAIL: v1 suite was accepted"
else
  echo "PASS: v1 suite rejected"
fi

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------

echo ""
echo "================ MATRIX SUMMARY ================"

TOTAL=0
FAILED=0

for KEY in "${!RESULTS[@]}"; do
  TOTAL=$((TOTAL+1))
  STATUS="PASS"
  if [ "${RESULTS[$KEY]}" -ne 0 ]; then
    STATUS="FAIL"
    FAILED=$((FAILED+1))
  fi
  printf "%-10s %s\n" "$KEY" "$STATUS"
done

echo ""
echo "Total runs: $TOTAL"
echo "Failures  : $FAILED"

echo ""
echo "================ MATRIX COMPLETE ================"