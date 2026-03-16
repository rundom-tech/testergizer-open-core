#!/usr/bin/env bash

# ===============================================
# VALID EXECUTION MATRIX
# ===============================================
# testergizer -> review only (no head mode, no retries)
# playwright  -> verify only
# strict      -> default
# relaxed     -> --debug
# playwright retries: 0, 1
# playwright modes: headless, headed
# ===============================================

set +e  # allow all runs

SUITE="examples/v2-demosauce/suites/demosauce-e2e-debug-mixed.json"
RUN=1

function banner() {
  echo ""
  echo "=============================================================="
  echo "RUN #$RUN"
  echo "ENGINE: $1"
  echo "INTENT: $2"
  echo "STRICTNESS: $3"
  echo "MODE: $4"
  echo "RETRIES: $5"
  echo "=============================================================="
  echo ""
}

function run_case() {
  ENGINE=$1
  INTENT=$2
  STRICTNESS=$3
  MODE=$4
  RETRIES=$5

  banner "$ENGINE" "$INTENT" "$STRICTNESS" "$MODE" "$RETRIES"

  CMD="testergizer run \"$SUITE\" \
    --engine $ENGINE \
    --intent $INTENT"

  # relaxed mode
  if [ "$STRICTNESS" = "relaxed" ]; then
    CMD="$CMD --debug"
  fi

  # playwright-specific flags
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

  RUN=$((RUN+1))
}

echo "================ VALID MATRIX START ================"

# ------------------------
# testergizer (review only)
# ------------------------
run_case "testergizer" "review" "strict"  "n/a" 0
run_case "testergizer" "review" "relaxed" "n/a" 0

# ------------------------
# playwright (verify only)
# ------------------------
for STRICTNESS in strict relaxed; do
  for MODE in headless headed; do
    run_case "playwright" "verify" "$STRICTNESS" "$MODE" 0
    run_case "playwright" "verify" "$STRICTNESS" "$MODE" 1
  done
done

echo ""
echo "================ VALID MATRIX COMPLETE ================"