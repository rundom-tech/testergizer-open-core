#!/usr/bin/env bash

# ============================================================
# GOVERNANCE MATRIX RUNNER
# ============================================================
# - Engine/Intent valid combinations only
# - Dimension-aware output folders
# - Strict vs Relaxed diff
# - Summary table
# - Allows all runs
# ============================================================

set +e

SUITE="examples/v2-demosauce/suites/demosauce-e2e-debug-mixed.json"
OUT_ROOT="artifacts/matrix"
RUN=1

declare -A RESULTS
declare -A FAILURES

mkdir -p "$OUT_ROOT"

function banner() {
  echo ""
  echo "=============================================================="
  echo "RUN #$RUN"
  echo "ENGINE: $1"
  echo "INTENT: $2"
  echo "STRICTNESS: $3"
  echo "MODE: $4"
  echo "RETRIES: $5"
  echo "OUT: $6"
  echo "=============================================================="
  echo ""
}

function run_case() {
  ENGINE=$1
  INTENT=$2
  STRICTNESS=$3
  MODE=$4
  RETRIES=$5

  TAG="${ENGINE}_${INTENT}_${STRICTNESS}"

  if [ "$ENGINE" = "playwright" ]; then
    TAG="${TAG}_${MODE}_r${RETRIES}"
  fi

  OUT_DIR="$OUT_ROOT/$TAG"
  mkdir -p "$OUT_DIR"

  banner "$ENGINE" "$INTENT" "$STRICTNESS" "$MODE" "$RETRIES" "$OUT_DIR"

  CMD="testergizer run \"$SUITE\" \
    --engine $ENGINE \
    --intent $INTENT \
    --out \"$OUT_DIR\""

  if [ "$STRICTNESS" = "relaxed" ]; then
    CMD="$CMD --debug"
  fi

  if [ "$ENGINE" = "playwright" ]; then
    if [ "$MODE" = "headed" ]; then
      CMD="$CMD --headed"
    else
      CMD="$CMD --headless"
    fi

    CMD="$CMD --retries $RETRIES"
  fi

  echo "$CMD"
  eval $CMD
  EXIT_CODE=$?

  RESULTS["$TAG"]=$EXIT_CODE
  if [ $EXIT_CODE -ne 0 ]; then
    FAILURES["$TAG"]=1
  fi

  RUN=$((RUN+1))
}

# ------------------------------------------------------------
# 1️⃣ TESTERGIZER (review only)
# ------------------------------------------------------------

run_case testergizer review strict  n/a 0
run_case testergizer review relaxed n/a 0

# ------------------------------------------------------------
# 2️⃣ PLAYWRIGHT (verify only)
# ------------------------------------------------------------

for STRICTNESS in strict relaxed; do
  for MODE in headless headed; do
    run_case playwright verify "$STRICTNESS" "$MODE" 0
    run_case playwright verify "$STRICTNESS" "$MODE" 1
  done
done

# ============================================================
# MATRIX SUMMARY
# ============================================================

echo ""
echo "================ MATRIX SUMMARY ================"
echo ""

TOTAL=0
FAILED=0

for KEY in "${!RESULTS[@]}"; do
  TOTAL=$((TOTAL+1))
  STATUS="PASS"
  if [ "${RESULTS[$KEY]}" -ne 0 ]; then
    STATUS="FAIL"
    FAILED=$((FAILED+1))
  fi
  printf "%-60s %s\n" "$KEY" "$STATUS"
done

echo ""
echo "Total runs: $TOTAL"
echo "Failures  : $FAILED"

# ============================================================
# STRICT vs RELAXED DIFF (Playwright only)
# ============================================================

echo ""
echo "================ STRICT vs RELAXED DIFF ================"

for MODE in headless headed; do
  for RETRIES in 0 1; do

    STRICT_KEY="playwright_verify_strict_${MODE}_r${RETRIES}"
    RELAX_KEY="playwright_verify_relaxed_${MODE}_r${RETRIES}"

    if [ -n "${RESULTS[$STRICT_KEY]}" ] && [ -n "${RESULTS[$RELAX_KEY]}" ]; then

      if [ "${RESULTS[$STRICT_KEY]}" -ne "${RESULTS[$RELAX_KEY]}" ]; then
        echo "DIFF DETECTED: $MODE retry=$RETRIES"
        echo "  strict  exit=${RESULTS[$STRICT_KEY]}"
        echo "  relaxed exit=${RESULTS[$RELAX_KEY]}"
      else
        echo "No diff: $MODE retry=$RETRIES"
      fi

    fi

  done
done

echo ""
echo "================ MATRIX COMPLETE ================"