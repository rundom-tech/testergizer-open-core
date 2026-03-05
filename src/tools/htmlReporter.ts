// src/tools/htmlReporter.ts
// CHANGELOG (2026-02-11)
// - Improved debug warning rendering semantics.
// - Explicitly clarifies reusable purity relaxation.
// - No structural or execution logic changes.
// - No layout refactors.
// - No CSS changes.
// - No noise.

import fs from "fs";
import path from "path";

import type { RunResult, TestAttemptResult, TestResult } from "../core/resultTypes";
import type { ArtifactsIndex } from "./artifactObserver";

export interface HtmlReporterOptions {
  /**
   * Absolute or relative path to:
   * artifacts/suiteId/date/runId
   *
   * The reporter will always write report.html into this directory.
   */
  outputDir: string;

  /**
   * Optional set of sensitive *values* (already-resolved secrets) that must be redacted
   * from the HTML report.
   *
   * NOTE: This mirrors JsonReporter sanitization semantics.
   */
  secretVars?: Set<string>;
}

export class HtmlReporter {
  private readonly outputDir: string;
  private readonly secretVars?: Set<string>;

  // Frozen branding asset locations (repo-root relative)
  private static readonly BRANDING_PRODUCT = "branding/vendor/product.png"; // Testergizer logo (optional)
  private static readonly BRANDING_VENDOR = "branding/vendor/vendor.png"; // RunDOM logo (mandatory - provenance marker)
  private static readonly BRANDING_CUSTOMER = "branding/customer/customer.png"; // Customer logo (optional)

  constructor(opts: HtmlReporterOptions) {
    this.outputDir = path.resolve(opts.outputDir);
    this.secretVars = opts.secretVars;

    this.validateBrandingInvariant();
  }

  /**
   * Frozen: always writes report.html (caller does not choose the filename).
   */
  write(run: RunResult, artifacts?: ArtifactsIndex): void {
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
    const outPath = path.join(this.outputDir, "report.html");
    fs.writeFileSync(outPath, this.render(outPath, run, artifacts), "utf-8");
  }

  /* =========================
   * Branding invariant (hard gate)
   * =========================
   *
   * Report lives at: artifacts/suiteId/date/runId/report.html
   * Branding lives at repo root: branding/...
   *
   * We compute repoRoot as outputDir/../../../../
   * and require vendor.png to exist there.
   */

  private validateBrandingInvariant(): void {
    const repoRoot = this.getRepoRootFromOutputDir();

    const mustExist = (repoRel: string, label: string) => {
      const abs = path.resolve(repoRoot, repoRel);
      if (!abs.startsWith(repoRoot)) {
        throw new Error(`HtmlReporter: branding path for '${label}' escapes repo root: '${repoRel}'`);
      }
      if (!fs.existsSync(abs)) {
        throw new Error(`HtmlReporter: missing mandatory branding asset for '${label}': '${repoRel}'`);
      }
    };

    // Vendor logo is mandatory (semantic provenance marker)
    mustExist(HtmlReporter.BRANDING_VENDOR, "vendor");

    // Product/customer are optional by spec — no failure if missing.
  }

  private getRepoRootFromOutputDir(): string {
    // outputDir is .../artifacts/suiteId/date/runId
    // repoRoot is four levels up
    return path.resolve(this.outputDir, "../../../../");
  }

  private computeBrandingSrc(reportHtmlPath: string, repoRelativeBrandingPath: string): string {
    const repoRoot = this.getRepoRootFromOutputDir();
    const absBrand = path.resolve(repoRoot, repoRelativeBrandingPath);

    // Convert to a relative URL from report.html directory, force forward slashes.
    return path.relative(path.dirname(reportHtmlPath), absBrand).replace(/\\/g, "/");
  }

  private brandingExists(repoRelativeBrandingPath: string): boolean {
    const repoRoot = this.getRepoRootFromOutputDir();
    const abs = path.resolve(repoRoot, repoRelativeBrandingPath);
    return abs.startsWith(repoRoot) && fs.existsSync(abs);
  }

  /**
   * Single source of truth for evidence href generation.
   *
   * Handles:
   * - absolute paths (e.g. video)
   * - repo-root relative paths starting with "artifacts/"
   * - run-root relative paths (relative to outputDir)
   *
   * Outputs:
   * - encoded, browser-friendly relative href when inside outputDir
   * - file:/// fallback when outside outputDir
   */
  private toHref(rawPath: string): string {
    const p = String(rawPath || "");
    if (!p) return "";

    let abs: string;

    if (path.isAbsolute(p)) {
      // Absolute path (e.g., video)
      abs = p;
    } else {
      const normalized = p.replace(/\\/g, "/");

      if (normalized.startsWith("artifacts/")) {
        // Repo-root relative
        abs = path.resolve(process.cwd(), normalized);
      } else {
        // Run-root relative
        abs = path.resolve(this.outputDir, normalized);
      }
    }

    const rel = path.relative(this.outputDir, abs).replace(/\\/g, "/");

    // If the artifact escapes outputDir, fall back to file://
    if (rel.startsWith("../") || rel === "..") {
      const fileUrl = "file:///" + abs.replace(/\\/g, "/").replace(/^\/+/, "");
      return encodeURI(fileUrl);
    }

    return encodeURI(rel);
  }

  private render(reportHtmlPath: string, run: RunResult, artifacts?: ArtifactsIndex): string {
    const esc = (s: any) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const fmtMs = (n: number) => {
      if (!Number.isFinite(n)) return "";
      if (n < 1000) return `${n} ms`;
      const s = n / 1000;
      if (s < 60) return `${s.toFixed(2)} s`;
      const m = Math.floor(s / 60);
      const rs = s - m * 60;
      return `${m}m ${rs.toFixed(1)}s`;
    };

    const resolveGotoUrl = (step: any): string | null => {
      if (String(step?.action).toLowerCase() !== "goto") return null;

      const raw = getTargetString(step);
      if (!raw) return null;

      // Already absolute
      if (/^https?:\/\//i.test(raw)) return raw;

      const base =
        (run as any).baseUrl ??
        (run as any).baseURL ??
        (run as any).projectBaseUrl;

      if (!base) return raw; // last-resort fallback

      try {
        return new URL(raw, base).toString();
      } catch {
        return raw;
      }
    };

    const badge = (result: string) => `<span class="badge badge-${esc(result)}">${esc(result)}</span>`;

    // Mirror JsonReporter redaction semantics: secretVars contains *values*.
    const sanitize = (value: any): any => {
      if (value === null || value === undefined) return value;

      if (typeof value === "string") {
        if (this.secretVars && this.secretVars.has(value)) return "••••••";
        return value;
      }

      if (Array.isArray(value)) return value.map((v) => sanitize(v));

      if (typeof value === "object") {
        const out: any = {};
        for (const [k, v] of Object.entries(value)) {
          if (typeof v === "string" && this.secretVars && this.secretVars.has(v)) {
            out[k] = "••••••";
          } else {
            out[k] = sanitize(v);
          }
        }
        return out;
      }

      return value;
    };

    const tryReadJson = (p: string): any | undefined => {
      try {
        if (!fs.existsSync(p)) return undefined;
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {
        return undefined;
      }
    };

    // Runtime-only compiler metadata (no schema changes).
    const provenanceDoc = tryReadJson(path.join(this.outputDir, "provenance.json"));
    const provenanceByTestId: Record<string, Record<string, any>> =
      provenanceDoc && typeof provenanceDoc === "object" ? provenanceDoc.byTestId ?? {} : {};

    // CTR helpers (report-level convenience)
    // Goal: when steps carry only raw selectors (e.g. Playwright),
    // try to display CTR logical keys as primary and keep selectors as collapsible details.
    const ctrLocators: Record<string, any> | undefined =
      (run as any).ctrDefinition && typeof (run as any).ctrDefinition === "object"
        ? ((run as any).ctrDefinition as any).locators
        : undefined;

    const ctrSelectorToKeys = new Map<string, string[]>();
    const ctrKeyToSelectors = new Map<string, Array<{ using: string; value: string }>>();

    if (ctrLocators && typeof ctrLocators === "object") {
      for (const [k, def] of Object.entries(ctrLocators)) {
        const sels: Array<{ using: string; value: string }> = Array.isArray((def as any).selectors)
          ? ((def as any).selectors as any[])
              .filter((s) => s && typeof s === "object" && typeof (s as any).using === "string" && typeof (s as any).value === "string")
              .map((s) => ({ using: String((s as any).using), value: String((s as any).value) }))
          : [];

        if (sels.length) ctrKeyToSelectors.set(k, sels);

        for (const s of sels) {
          const add = (v: string) => {
            const vv = String(v);
            if (!vv) return;
            const cur = ctrSelectorToKeys.get(vv);
            if (cur) {
              if (!cur.includes(k)) cur.push(k);
            } else {
              ctrSelectorToKeys.set(vv, [k]);
            }
          };

          add(s.value);
          add(`${s.using}=${s.value}`);
        }
      }
    }

    const normalizeSelectorForMatch = (raw: string): string => {
      const r = String(raw ?? "").trim();
      if (!r) return r;
      // Strip common "using=" prefixes
      const m = r.match(/^(css|xpath|text|id)=/i);
      if (m) return r.slice(m[0].length);
      return r;
    };

    const pickClrKeyForSelector = (rawSelector: string): string | undefined => {
      const raw = String(rawSelector ?? "").trim();
      if (!raw) return undefined;

      // Direct matches first, then normalized.
      const direct = ctrSelectorToKeys.get(raw);
      if (direct && direct.length) return [...direct].sort()[0];

      const normalized = normalizeSelectorForMatch(raw);
      const normalizedHit = ctrSelectorToKeys.get(normalized);
      if (normalizedHit && normalizedHit.length) return [...normalizedHit].sort()[0];

      // Also try "css=" + value for Playwright-style raw CSS
      const cssHit = ctrSelectorToKeys.get(`css=${normalized}`);
      if (cssHit && cssHit.length) return [...cssHit].sort()[0];

      return undefined;
    };

    const debugWarningsDoc = tryReadJson(path.join(this.outputDir, "debug-warnings.json"));
    const debugWarnings: any[] =
      debugWarningsDoc && typeof debugWarningsDoc === "object" && Array.isArray(debugWarningsDoc.warnings)
        ? debugWarningsDoc.warnings
        : [];
    // ========================================================
    // DEBUG WARNINGS INDEX (by exact stepId)
    // Runtime-only. No schema change.
    // ========================================================

    const debugWarningsByStepId: Record<string, any[]> = {};

    for (const w of debugWarnings) {
      if (!w?.stepId) continue;

      if (!debugWarningsByStepId[w.stepId]) {
        debugWarningsByStepId[w.stepId] = [];
      }

      debugWarningsByStepId[w.stepId].push(w);
    }

    /* =========================
     * Branding rendering (frozen paths)
     * ========================= */

    const renderBrandImg = (repoRel: string, alt: string, cls?: string) => {
      if (!this.brandingExists(repoRel)) return "";
      const src = this.computeBrandingSrc(reportHtmlPath, repoRel);
      return `<img class="logo ${cls ?? ""}" src="${esc(src)}" alt="${esc(alt)}" />`;
    };

    const observations = Array.isArray(artifacts?.observations) ? (artifacts!.observations as any[]) : [];

    const obsForAttempt = (testId: string, attempt: number) =>
      observations.filter((o) => o?.execution?.testId === testId && o?.execution?.attempt === attempt);

    const obsForStep = (testId: string, attempt: number, stepId: string) =>
      observations.filter(
        (o) => o?.execution?.testId === testId && o?.execution?.attempt === attempt && o?.execution?.stepId === stepId
      );

    const renderEvidenceLinks = (items: any[]) => {
      if (!items.length) return "";

      const links = items
        .map((o) => {
          const href = this.toHref(String(o?.artifact?.path || ""));
          if (!href) return "";
          const label = o?.type ? String(o.type) : "evidence";
          return `<a class="evidence" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(
            label
          )}</a>`;
        })
        .filter(Boolean)
        .join(" ");

      return links ? `<div class="evidence-row">${links}</div>` : "";
    };

    // Step 2.1 (masking policy): redact password-like fills regardless of origin.
    const getTargetString = (step: any): string => {
      const t = step?.target;
      if (typeof t === "string") return t;
      if (t && typeof t === "object" && typeof t.value === "string") return t.value;
      return "";
    };

    const isPasswordLikeFill = (step: any): boolean => {
      if (String(step?.action ?? "").toLowerCase() !== "fill") return false;
      const target = getTargetString(step);
      if (!target) return false;
      // Heuristic: anything that *looks* like a password field.
      // Examples: "#password", "input[name=password]", "[data-test=password]", etc.
      return /password/i.test(target);
    };

    /* =========================
     * Step 2.2 (visual rail):
     * Icon + result-class rail on the left, vertically centered (Option A).
     * ========================= */

    const normalizeResult = (r: any): string => {
      const s = String(r ?? "").trim().toLowerCase();
      if (!s) return "unknown";
      return s;
    };

    const stepRailClass = (result: string): string => {
      switch (result) {
        case "passed":
          return "step-passed";
        case "failed":
          return "step-failed";
        case "aborted":
          return "step-aborted";
        case "skipped":
          return "step-skipped";
        default:
          return "step-unknown";
      }
    };

    const stepRailIcon = (result: string): string => {
      switch (result) {
        case "passed":
          return "✓";
        case "failed":
          return "✕";
        case "aborted":
          return "⦸";
        case "skipped":
          return "⏭";
        default:
          return "•";
      }
    };

    const renderClrResolution = (step: any): string => {
      const t = (step as any).target;
      if (!t || typeof t !== "object") return "";

      const attempts = Array.isArray(t.attempts) ? t.attempts : [];
      const resolvedBy = t.resolvedBy;

      const value =
        typeof t.value === "string" ? t.value : undefined;

      const logical =
        typeof t.logical === "string" ? t.logical : undefined;

      const secondary =
        logical && value && logical !== value
          ? `<div class="ctr-secondary muted"><code>${esc(value)}</code></div>`
          : "";

      if (!attempts.length) return secondary;

      const resolvedLine =
        resolvedBy && resolvedBy.using && resolvedBy.value
          ? `<div><span class="k">resolved:</span> <span class="mono">${esc(resolvedBy.using)} → ${esc(resolvedBy.value)}</span></div>`
          : "";

      const attemptsHtml = attempts
        .map((a: any, i: number) => {
          const ok = a.result === "success";
          return `<div>${i + 1}. ${esc(a.using)} → <span class="mono">${esc(a.value)}</span> ${ok ? "✓" : "✕"}</div>`;
        })
        .join("");

      return `
        <div class="ctr-block">
          ${secondary}
          <details class="locator-resolution">
            <summary class="muted">Locator resolution</summary>
            <div class="locator-resolution-body mono">
              ${resolvedLine}
              <div class="locator-attempts">
                ${attemptsHtml}
              </div>
            </div>
          </details>
        </div>
      `;
    };

    const renderStepRow = (step: any, testId: string, attempt: number) => {
      const isApi = run.executionEngine === "api";
      const errors = Array.isArray(step.errors) ? step.errors : [];
      const errHtml = errors.length
        ? `<details class="errors"><summary>${errors.length} error(s)</summary>${errors
            .map(
              (e: any) =>
                `<div class="error"><div class="mono">${esc(e.reason)}: ${esc(e.message)}</div>${
                  e.stack ? `<pre class="stack">${esc(e.stack)}</pre>` : ""
                }</div>`
            )
            .join("")}</details>`
        : "";

      const evidence = renderEvidenceLinks(obsForStep(testId, attempt, step.id));

      const prov = provenanceByTestId?.[testId]?.[String(step.id)];
      const originHtml = prov
        ? `<details class="origin"><summary>Origin</summary>
            <div class="origin-body">
              <div><span class="k">executable:</span> <span class="mono">${esc(prov.originExecutableId)}</span></div>
              <div><span class="k">path:</span> <span class="mono">${esc(prov.originPath)}</span></div>
              <div><span class="k">reusable:</span> <span class="mono">${esc(prov.reusable)}</span></div>
              <div><span class="k">stack:</span> <span class="mono">${esc(
                Array.isArray(prov.includeStack) ? prov.includeStack.join(" → ") : ""
              )}</span></div>
            </div>
          </details>`
        : "";

      const targetHtml = (() => {
        const t = (step as any).target;

        const renderDetails = (opts: { logical?: string; rawSelector?: string }) => {
          const logical = opts.logical ? String(opts.logical) : undefined;
          const rawSelector = opts.rawSelector ? String(opts.rawSelector) : undefined;

          const label = isApi ? "endpoint" : "locator";
          const subLabel = isApi ? "url" : "selector";

          const selectors =
            logical && ctrKeyToSelectors.has(logical)
              ? (ctrKeyToSelectors.get(logical) ?? [])
              : [];

          const selectorList = selectors.length
            ? `<div class="mono" style="margin-top:6px">
                 <div><span class="k">alternatives:</span></div>
                 ${selectors
                   .map((s) => `<div class="mono"><span class="muted">${esc(s.using)}</span> <code>${esc(s.value)}</code></div>`)
                   .join("")}
               </div>`
            : "";

          const rawLine = rawSelector
            ? `<div class="mono"><span class="k">${subLabel}:</span> <code>${esc(rawSelector)}</code></div>`
            : "";

          if (!rawLine && !selectorList) return "";

          return `
            <details class="target-more">
              <summary class="muted mono">${label}</summary>
              <div class="target-more-body">
                ${rawLine}
                ${selectorList}
              </div>
            </details>
          `;
        };

        // Back-compat: target may be a plain string (Playwright often uses this).
        if (typeof t === "string") {
          const raw = t.trim();
          if (!raw) return `<span class="action-target unresolved">(no target)</span>`;

          const inferred = pickClrKeyForSelector(raw);
          const primary = inferred ?? raw;

          return `
            <span class="action-arrow">→</span>
            <span class="action-target"><code>${esc(primary)}</code></span>
            ${inferred ? renderDetails({ logical: inferred, rawSelector: raw }) : ""}
          `;
        }

        if (!t || typeof t !== "object") {
          return `<span class="action-target unresolved">(no target)</span>`;
        }

        const logical = typeof t.logical === "string" ? t.logical : undefined;
        const value = typeof t.value === "string" ? t.value : undefined;

        const unresolved = t.resolved === false;

        // If logical is missing but we have a selector value, try to infer CTR key from run.ctrDefinition.locators.
        const inferred = !logical && value ? pickClrKeyForSelector(value) : undefined;

        const primary = logical ?? inferred ?? value;

        if (!primary) {
          return `<span class="action-target unresolved">(no target)</span>`;
        }

        const detailsLogical = logical ?? inferred;

        return `
          <span class="action-arrow">→</span>
          <span class="action-target ${unresolved ? "unresolved" : ""}">
            <code>${esc(primary)}</code>
            ${unresolved ? " (not found)" : ""}
          </span>
          ${detailsLogical || value ? renderDetails({ logical: detailsLogical, rawSelector: value }) : ""}
        `;
      })();

      const dataHtml = (() => {
        const forceMasked = isPasswordLikeFill(step);

        // Prefer compiled/runtime metadata if present.
        const dObj = (step as any).data;

        if (dObj && typeof dObj === "object" && "value" in dObj) {
          const raw = sanitize((dObj as any).value);
          const masked = (dObj as any).masked === true || forceMasked;
          let shown = masked ? "••••••" : String(raw);

          // Semantic highlighting for API status codes
          if (!masked && isApi && typeof raw === "number") {
             const status = raw;
             let colorClass = "badge-muted";
             if (status >= 200 && status < 300) colorClass = "badge-passed";
             else if (status >= 400) colorClass = "badge-failed";
             else if (status >= 300) colorClass = "badge-aborted";

             shown = `<span class="badge ${colorClass}">${status}</span>`;
             return `
               <span class="action-data ${masked ? "masked" : ""}">
                 = ${shown}
               </span>
             `;
          }

          return `
            <span class="action-data ${masked ? "masked" : ""}">
              = <code>${esc(shown)}</code>
              ${masked ? " (masked)" : ""}
            </span>
          `;
        }

        // Back-compat: many actions still store parameters in step.value / step.input
        const raw = (step as any).value ?? (step as any).input;
        if (raw === undefined) return "";

        const masked = forceMasked;
        const redacted = sanitize(raw);
        const shown = masked ? "••••••" : String(redacted);

        return `
          <span class="action-data ${masked ? "masked" : ""}">
            = <code>${esc(shown)}</code>
            ${masked ? " (masked)" : ""}
          </span>
        `;
      })();

      // NEW BLOCK: Renders API headers and body payload securely from the step.data object
      const payloadHtml = (() => {
        if (!isApi) return "";
        const dObj = (step as any).data;
        if (!dObj) return "";

        let parts = "";

        if (dObj.headers && Object.keys(dObj.headers).length > 0) {
          const hdrs = JSON.stringify(dObj.headers, null, 2);
          parts += `
            <details class="target-more" style="margin-top: 6px;">
              <summary class="muted mono">headers</summary>
              <div class="target-more-body" style="background: rgba(127,127,127,0.05); border-radius: 4px; padding: 8px;">
                <pre class="mono" style="margin: 0; font-size: 11px; max-height: 200px; overflow-y: auto;">${esc(hdrs)}</pre>
              </div>
            </details>
          `;
        }

        if (dObj.body !== undefined) {
          const bodyStr = typeof dObj.body === 'object' ? JSON.stringify(dObj.body, null, 2) : String(dObj.body);
          parts += `
            <details class="target-more" style="margin-top: 6px;">
              <summary class="muted mono">{ } payload</summary>
              <div class="target-more-body" style="background: rgba(127,127,127,0.05); border-radius: 4px; padding: 8px;">
                <pre class="mono" style="margin: 0; font-size: 11px; max-height: 400px; overflow-y: auto;">${esc(bodyStr)}</pre>
              </div>
            </details>
          `;
        }

        return parts ? `<div class="api-response-details" style="margin-top: 8px; margin-left: 20px;">${parts}</div>` : "";
      })();

      // NEW BLOCK (SPRINT 4): Renders captured state / extracted variables for both UI and API
      const extractedHtml = (() => {
        const dObj = (step as any).data;
        if (!dObj || !dObj.extracted || Object.keys(dObj.extracted).length === 0) return "";

        const ext = dObj.extracted;
        const count = Object.keys(ext).length;
        
        let rows = "";
        for (const [k, v] of Object.entries(ext)) {
          const displayValue = typeof v === 'object' ? JSON.stringify(v) : String(v);
          const typeLabel = typeof v;
          rows += `
            <div class="extracted-row">
              <span class="extracted-key mono" title="Type: ${esc(typeLabel)}">{{${esc(k)}}}</span>
              <span class="extracted-val mono">${esc(displayValue)}</span>
            </div>
          `;
        }

        return `
          <div class="api-response-details" style="margin-top: 8px; margin-left: 20px;">
            <details class="target-more step-extracted" style="margin-top: 6px;">
              <summary class="muted mono">🔗 captured state (${count})</summary>
              <div class="target-more-body extracted-table">
                ${rows}
              </div>
            </details>
          </div>
        `;
      })();

      /*
       * ATTACH WARNING TO STEP
       * Inline reusable purity warnings (debug semantics).
       */
      const warningsHtml = (() => {
        const ws = Array.isArray(step.warnings) ? step.warnings : [];
        const inlineDebugWarnings = debugWarningsByStepId[String(step.id)] ?? [];

        const allWarnings = [...ws, ...inlineDebugWarnings];
        if (!allWarnings.length) return "";

        return `
          <details class="step-warnings">
            <summary class="warn-toggle">⚠️ ${allWarnings.length}</summary>
            <div class="warn-body">
              ${allWarnings
                .map((w: any) => `<div class="warn-item mono">${esc(w.message ?? String(w))}</div>`)
                .join("")}
            </div>
          </details>
        `;
      })();

      const execHtml = `
        <details class="step-exec">
          <summary class="exec-toggle" title="Execution details">ℹ️</summary>
          <div class="exec-body mono">
            <div><span class="k">result:</span> ${esc(step.status ?? step.result)}</div>            
            <div><span class="k">started:</span> ${esc(step.startedAt)}</div>
            <div><span class="k">ended:</span> ${esc(step.endedAt)}</div>
            <div><span class="k">duration:</span> ${esc(fmtMs(step.durationMs))}</div>
          </div>
        </details>
      `;

      const stepResult = normalizeResult(step.status ?? step.result);
      const railCls = stepRailClass(stepResult);
      const railIcon = stepRailIcon(stepResult);

      return `
        <tr data-step-id="${esc(step.id)}">
          <td class="action-cell">
            <div class="step-row">
              <div class="step-rail ${esc(railCls)}" aria-label="step result: ${esc(stepResult)}" title="${esc(
        stepResult
      )}">
                <span class="step-icon" aria-hidden="true">${esc(railIcon)}</span>
              </div>

              <div class="step-body">
                <div class="action-main">
                  <span class="action-name">${esc(step.action)}</span>
                  ${targetHtml}
                  ${renderClrResolution(step)}
                  ${dataHtml}
                  ${warningsHtml}
                  ${execHtml}
                </div>
                ${payloadHtml}
                ${extractedHtml}
                ${errHtml}
                ${evidence}
                ${originHtml}
              </div>
            </div>
          </td>
        </tr>
      `;
    };

    const renderAttempt = (a: TestAttemptResult, testId: string, attemptIndex: number, totalAttempts: number) => {
      const attErrors = Array.isArray((a as any).errors) ? (a as any).errors : [];

      const headerBits: string[] = [];
      /**
       * PHASE 1 — EVIDENCE CORRECTION (attempt numbering)
       *
       * Attempt "X of Y" must be based on the test's attempts array length,
       * NOT on number of steps.
       */
      headerBits.push(
        `<span class="k">Attempt</span> <span class="mono">${esc(attemptIndex)} of ${esc(totalAttempts)}</span>`
      );

      headerBits.push(badge((a as any).result));
      headerBits.push(`<span class="muted mono">${esc((a as any).startedAt)} → ${esc((a as any).endedAt)}</span>`);
      headerBits.push(`<span class="mono">${esc(fmtMs((a as any).durationMs))}</span>`);

      if ((a as any).instrumentation) {
        const ins = (a as any).instrumentation;
        const flags: string[] = [];
        if (ins.video) flags.push(`video=${ins.video.enabled ? "on" : "off"}`);
        if (ins.snapshot) flags.push(`snapshot=${ins.snapshot.enabled ? "on" : "off"}`);
        if (ins.domSnapshot) flags.push(`domSnapshot=${ins.domSnapshot.enabled ? "on" : "off"}`);
        if (flags.length) headerBits.push(`<span class="pill mono">${esc(flags.join(" "))}</span>`);
      }

      const attemptEvidence = renderEvidenceLinks(obsForAttempt(testId, (a as any).attempt));

      const attemptErrorsHtml = attErrors.length
        ? `<details class="errors"><summary>${attErrors.length} attempt error(s)</summary>${attErrors
            .map(
              (e: any) =>
                `<div class="error"><div class="mono">${esc(e.reason)}: ${esc(e.message)}</div>${
                  e.stack ? `<pre class="stack">${esc(e.stack)}</pre>` : ""
                }</div>`
            )
            .join("")}</details>`
        : "";

      const steps = Array.isArray((a as any).steps) ? (a as any).steps : [];

      return `
        <details class="card attempt-card" ${(a as any).result !== "passed" ? "open" : ""}>
          <summary>
            <div class="card-title">
              ${headerBits.join(" ")}
            </div>
          </summary>

          <div class="card-body">          
            ${attemptEvidence}
            ${attemptErrorsHtml}
            <table class="table">
              <thead>
                <tr>
                  <th>Steps</th>
                </tr>              
              </thead>
              <tbody>
                ${(() => {
                  const rows: string[] = [];
                  let currentGroup: { name: string; steps: any[] } | null = null;

                  const flushGroup = () => {
                    if (!currentGroup) return;
                    rows.push(`
                      <tr class="step-group">
                        <td>
                          <details>
                            <summary class="step-group-title">${esc(currentGroup.name)}</summary>
                            <table class="table nested">
                              <tbody>
                                ${currentGroup.steps.map((s) => renderStepRow(s, testId, (a as any).attempt)).join("")}
                              </tbody>
                            </table>
                          </details>
                        </td>
                      </tr>
                    `);
                    currentGroup = null;
                  };

                  for (const s of steps) {
                    const g = (s as any).group?.name;
                    if (g) {
                      if (!currentGroup || currentGroup.name !== g) {
                        flushGroup();
                        currentGroup = { name: g, steps: [] };
                      }
                      currentGroup.steps.push(s);
                    } else {
                      flushGroup();
                      rows.push(renderStepRow(s, testId, (a as any).attempt));
                    }
                  }

                  flushGroup();
                  return rows.join("");
                })()}
              </tbody>
            </table>         
          </div> 
        </details>
      `;
    };

    const renderTestCard = (t: TestResult, idx: number) => {
      const attempts = Array.isArray((t as any).attempts) ? (t as any).attempts : [];
      
      const isApi = run.executionEngine === "api";
      const engineLabel = isApi ? "engine: node" : `project: ${esc((t as any).projectId)}`;
      const domainLabel = isApi ? "domain: REST API" : "";

      return `
        <details class="card" ${idx === 0 ? "open" : ""}>
          <summary>
            <div class="card-title">
              <span class="title">${esc(t.id)}</span>
              ${badge((t as any).result)}
              <span class="muted mono">${esc((t as any).startedAt)} → ${esc((t as any).endedAt)}</span>
              <span class="mono">${esc(fmtMs((t as any).durationMs))}</span>
            </div>
            <div class="card-meta mono">
              ${engineLabel}
              ${domainLabel ? `<span class="sep">|</span> ${domainLabel}` : ""}
              <span class="sep">|</span> attempts: ${esc(attempts.length)}
            </div>
          </summary>

          <div class="card-body">
            <div class="section">
              <div class="section-title">Attempts</div>
              ${attempts.map((a: any, i: number) => renderAttempt(a, t.id, i + 1, attempts.length)).join("")}
            </div>
            <div class="section">
              <div class="section-title">Raw JSON</div>
              <div class="mono"><a href="./${esc((t as any).projectId)}/${esc(
        t.id
      )}/result.json" target="_blank" rel="noopener noreferrer">result.json</a></div>
            </div>
          </div>
        </details>
      `;
    };

    const tests = Array.isArray((run as any).tests) ? (run as any).tests : [];

    // ========================================================
    // INVALID & SKIPPED (runtime-only channels)
    // ========================================================

    const invalidBlock = (run as any).invalidation;
    const skippedBlock = (run as any).skipped;

    const invalidTests: any[] = invalidBlock && Array.isArray(invalidBlock.tests) ? invalidBlock.tests : [];

    const skippedTests: any[] = skippedBlock && Array.isArray(skippedBlock.tests) ? skippedBlock.tests : [];

    const summary = run.summary;
    const summaryHtml = `
      <div class="content">
        <div class="summary-container">
          <div class="summary-wrapper">
            <div class="section-title" style="margin-top: 0;">Execution Summary</div>
            <div class="summary-box">
              <div class="summary-item">
                <span class="k">Total</span>
                <span class="v">${esc(summary.total)}</span>
              </div>

              ${
                run.executionEngine === "testergizer"
                  ? `
              <div class="summary-item">
                <span class="k">Valid</span>
                <span class="v">${esc(summary.valid)}</span>
              </div>
              <div class="summary-item">
                <span class="k">Invalid</span>
                <span class="v">${esc(summary.invalid)}</span>
              </div>
              <div class="summary-item">
                <span class="k">Reviewed</span>
                <span class="v">${esc(summary.reviewed)}</span>
              </div>
                  `
                  : `
              <div class="summary-item">
                <span class="k">Passed</span>
                <span class="v">${esc(summary.passed)}</span>
              </div>
              <div class="summary-item">
                <span class="k">Failed</span>
                <span class="v">${esc(summary.failed)}</span>
              </div>
              <div class="summary-item">
                <span class="k">Aborted</span>
                <span class="v">${esc(summary.aborted)}</span>
              </div>
                  `
              }

              ${(() => {
                const signal = run.signalStrength ?? 0;
                const sign = signal > 0 ? "+" : "";
                return `
              <div class="summary-item signal-item" data-signal="${signal}">
                <span class="k">Signal</span>
                <span class="v">${sign}${signal}%</span>
              </div>
                `;
              })()}
            </div>
          </div>
        </div>
      </div>
    `;

    const debugBanner = debugWarnings.length
      ? `
        <div class="content">
          <details class="card" open>
            <summary class="card-title">
              <span class="title">Warnings & Notices</span>
              <span class="badge badge-warning">info</span>
            </summary>
            <div class="card-body">
              <div class="debug-banner">
                ⚠️ DEBUG MODE — Reusable purity rules were relaxed for this run.
                (<a href="./debug-warnings.json" target="_blank" rel="noopener noreferrer">debug-warnings.json</a>)
              </div>
              ${invalidTests.length ? `<div class="debug-banner">⚠️ ${esc(invalidTests.length)} invalid test(s) detected during compile phase</div>` : ""}
              ${skippedTests.length ? `<div class="debug-banner">⏭ ${esc(skippedTests.length)} test(s) intentionally skipped</div>` : ""}
            </div>
          </details>
        </div>
      `
      : (invalidTests.length || skippedTests.length)
      ? `
        <div class="content">
          <details class="card" open>
            <summary class="card-title">
              <span class="title">Warnings & Notices</span>
              <span class="badge badge-warning">info</span>
            </summary>
            <div class="card-body">
              ${invalidTests.length ? `<div class="debug-banner">⚠️ ${esc(invalidTests.length)} invalid test(s) detected during compile phase</div>` : ""}
              ${skippedTests.length ? `<div class="debug-banner">⏭ ${esc(skippedTests.length)} test(s) intentionally skipped</div>` : ""}
            </div>
          </details>
        </div>
      `
      : "";

    const invalidBanner = "";
    const skippedBanner = "";

    // Customer left, Testergizer right (both optional)
    const customerLogo = renderBrandImg(HtmlReporter.BRANDING_CUSTOMER, "Customer", "logo-large");
    const testergizerLogo = renderBrandImg(HtmlReporter.BRANDING_PRODUCT, "Testergizer", "logo-large");

    const header = `
      <div class="header">
        <div class="header-grid">
          <div class="header-left">${customerLogo}</div>
          <div class="header-center">
            <div class="h1">
              <span class="app-name">${esc(run.applicationName)}</span>
              <span class="report-title">Automated Tests Run Report</span>
            </div>
          </div>
          <div class="header-right">${testergizerLogo}</div>
        </div>
      </div>
    `;

    const list = `
      <div class="content">
        <div class="section-title">Tests</div>
        ${tests.map((t: any, idx: number) => renderTestCard(t, idx)).join("")}
      </div>
    `;

    const invalidSection = invalidTests.length
      ? `
        <div class="content">
          <div class="section-title">Invalid Tests</div>
          ${invalidTests
            .map(
              (t: any, idx: number) => `
                <details class="card" ${idx === 0 ? "open" : ""}>
                  <summary>
                    <div class="card-title">
                      <span class="title">${esc(t.testId)}</span>
                      <span class="badge badge-failed">invalid</span>
                      <span class="muted mono">compile</span>
                    </div>
                    <div class="card-meta mono">path: ${esc(t.testPath)}</div>
                  </summary>
                  <div class="card-body">
                    <div class="section">
                      <div class="section-title">Details</div>
                      <div class="mono">
                        <div><span class="k">Path:</span> ${esc(t.testPath)}</div>
                        <div><span class="k">Phase:</span> ${esc(t.phase)}</div>
                        <div><span class="k">Reason:</span> ${esc(t.reason)}</div>
                      </div>
                    </div>
                    ${
                      t.stack
                        ? `
                          <div class="section">
                            <div class="section-title">Stack</div>
                            <pre class="stack mono">${esc(t.stack)}</pre>
                          </div>
                        `
                        : ""
                    }
                  </div>
                </details>
              `
            )
            .join("")}
        </div>
      `
      : "";

    const skippedSection = skippedTests.length
      ? `
        <div class="content">
          <div class="section-title">Skipped Tests</div>
          ${skippedTests
            .map(
              (t: any, idx: number) => `
                <details class="card" ${idx === 0 && !invalidTests.length ? "open" : ""}>
                  <summary>
                    <div class="card-title">
                      <span class="title">${esc(t.testId)}</span>
                      <span class="badge badge-skipped">skipped</span>
                      <span class="muted mono">intentional</span>
                    </div>
                    <div class="card-meta mono">path: ${esc(t.testPath)}</div>
                  </summary>
                  <div class="card-body">
                    <div class="section">
                      <div class="section-title">Details</div>
                      <div class="mono">
                        <div><span class="k">Path:</span> ${esc(t.testPath)}</div>
                        <div><span class="k">Reason:</span> ${esc(t.reason ?? "No reason provided")}</div>
                      </div>
                    </div>
                  </div>
                </details>
              `
            )
            .join("")}
        </div>
      `
      : "";

    const footer = `
      <div class="footer">
        Powered by Testergizer | Copyright 2025 © RunDOM Technologies
      </div>
    `;

    const runMetaInner = `
        <details class="card" open>
          <summary class="card-title">
            <span class="title">Run metadata</span>
            <span class="badge badge-muted">run</span>
            <span class="state-icon"></span>
          </summary>
          <div class="card-body mono run-meta">
            <div><span class="k">Suite:</span> <span class="mono">${esc(run.suiteId)}</span></div>
            ${run.suiteName ? `<div><span class="k">Suite name:</span> ${esc(run.suiteName)}</div>` : ""}
            <div><span class="k">Run ID:</span> <span class="mono">${esc(run.runId)}</span></div>
            <div><span class="k">Project:</span> <span class="mono">${esc(run.projectId)}</span></div>
            <div><span class="k">Base URL:</span> <span class="mono">${esc((run as any).baseUrl)}</span></div>
            <div><span class="k">Execution engine:</span> <span class="mono">${esc(run.executionEngine)}</span></div>
            <div><span class="k">Execution intent:</span> <span class="mono">${esc(run.executionIntent)}</span></div>
            <div><span class="k">Validation mode:</span> <span class="mono">${esc(run.validationMode)}</span></div>
            ${(run as any).launch?.command ? `<div><span class="k">Launch:</span> <span class="mono">${esc((run as any).launch.command)}</span></div>` : ""}
            ${(run as any).launch?.cwd ? `<div><span class="k">Launch cwd:</span> <span class="mono">${esc((run as any).launch.cwd)}</span></div>` : ""}
            <div><span class="k">Started at:</span> <span class="mono">${esc(run.startedAt)}</span></div>
            <div><span class="k">Ended at:</span> <span class="mono">${esc(run.endedAt)}</span></div>
            <div><span class="k">Duration:</span> <span class="mono">${fmtMs(run.durationMs)}</span></div>
          </div>
        </details>
    `;

    const ctrRes = (run as any).ctrResolution;
    const ctrDef = (run as any).ctrDefinition;
    const hasCtrData = ctrDef || ctrRes;

    const ctrSectionInner = hasCtrData
      ? `
        <details class="card" open>
          <summary class="card-title">
            <span class="title">CTR governance</span>
            <span class="badge badge-muted">ctr</span>
            <span class="state-icon"></span>
          </summary>
          <div class="card-body mono run-meta">
            ${ctrDef?.id ? `<div><span class="k">Registry ID:</span> <span class="mono">${esc(ctrDef.id)}</span></div>` : ""}
            ${ctrDef?.domain ? `<div><span class="k">Domain:</span> <span class="mono">${esc(ctrDef.domain)}</span></div>` : ""}
            <div><span class="k">App ID:</span> <span class="mono">${esc(ctrRes?.appId ?? ctrDef?.appId ?? "-")}</span></div>
            <div><span class="k">Version Range:</span> <span class="mono">${esc(ctrRes?.versionRange ?? ctrDef?.versionRange ?? "-")}</span></div>
            <div><span class="k">Detected AUT Version:</span> <span class="mono">${esc(ctrRes?.detectedAutVersion ?? "-")}</span></div>
            <div><span class="k">Version Status:</span> <span class="mono">${esc(ctrRes?.versionCheck?.status ?? "unmanaged")}</span></div>
            ${ctrRes?.domCheck ? `<div><span class="k">DOM Status:</span> <span class="mono">${esc(ctrRes.domCheck.status)}</span></div>` : ""}
            ${ctrDef?.endpoints ? `<div><span class="k">Endpoints Loaded:</span> <span class="mono">${Object.keys(ctrDef.endpoints).length}</span></div>` : ""}
          </div>
        </details>
      `
      : "";

    const metadataGridHtml = `
      <div class="content">
        <div class="metadata-grid">
          ${runMetaInner}
          ${ctrSectionInner}
        </div>
      </div>
    `;

    const actions = `
      <div class="actions">
        <button class="btn" data-action="expand-all">Expand all</button>
        <button class="btn" data-action="collapse-all">Collapse all</button>
        <a class="btn" href="./run.json" target="_blank" rel="noopener noreferrer">run.json</a>
        <a class="btn" href="./artifacts.json" target="_blank" rel="noopener noreferrer">artifacts.json</a>
        <button class="btn" data-action="view">View ▾</button>
      </div>
    `;

    const layoutCssHref = "../../../../src/tools/report.layout.css";
    const defaultThemeHref = "../../../../themes/default/theme.css";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(run.applicationName)} Automated Tests Run Report</title>

    <link rel="stylesheet" href="${esc(layoutCssHref)}" />

    <link id="tg-theme" rel="stylesheet" href="${esc(defaultThemeHref)}" />
  </head>

  <body>
    ${header}
    ${metadataGridHtml}
    ${summaryHtml}
    ${debugBanner}
    ${invalidBanner}
    ${skippedBanner}
    ${actions}
    ${list}
    ${invalidSection}
    ${skippedSection}
    ${footer}
    <script>
    (function () {
      'use strict';

      /* ---------- helpers ---------- */

      function $(id) {
        return document.getElementById(id);
      }

      function show(el) {
        if (el) el.hidden = false;
      }

      function hide(el) {
        if (el) el.hidden = true;
      }

      /* ---------- core actions ---------- */

      function expandAll() {
        document.querySelectorAll('details.card').forEach(d => d.open = true);
      }

      function collapseAll() {
        document.querySelectorAll('details.card').forEach(d => d.open = false);
      }

      /* ---------- click handling ---------- */

      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;

        var viewMenu = $('view-menu');
        var appearancePanel = $('appearance-panel');

        var actionBtn = t.closest ? t.closest('[data-action]') : null;
        var action = actionBtn ? actionBtn.getAttribute('data-action') : null;

        if (action === 'expand-all') {
          expandAll();
          return;
        }

        if (action === 'collapse-all') {
          collapseAll();
          return;
        }

        if (action === 'view') {
          if (!viewMenu) return;

          if (viewMenu.hidden) {
            show(viewMenu);
            var r = actionBtn.getBoundingClientRect();
            viewMenu.style.position = 'absolute';
            viewMenu.style.top = (r.bottom + window.scrollY + 6) + 'px';
            viewMenu.style.left = (r.left + window.scrollX) + 'px';
          } else {
            hide(viewMenu);
          }
          return;
        }

        if (action === 'open-appearance') {
          hide(viewMenu);
          show(appearancePanel);
          return;
        }

        if (t.classList.contains('ap-backdrop')) {
          hide(appearancePanel);
          return;
        }

        if (viewMenu && !viewMenu.contains(t) && action !== 'view') {
          hide(viewMenu);
        }
      });

      /* ---------- theme switching ---------- */

      document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || t.id !== 'ap-theme') return;

        var themeLink = $('tg-theme');
        if (!themeLink) return;

        themeLink.href = '../../../../themes/' + t.value + '/theme.css';
      });

      /* ---------- ESC closes appearance ---------- */

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          hide($('appearance-panel'));
          hide($('view-menu'));
        }
      });

    })();
    </script>
    <div id="view-menu" hidden>
      <button class="menu-item" data-action="open-appearance">
        Appearance
      </button>
    </div>

    <div id="appearance-panel" hidden>
      <div class="ap-backdrop"></div>
      <div class="appearance-panel">
        <div class="ap-title">Appearance</div>
        <div class="ap-group">
          <div class="ap-label">Theme</div>
          <select id="ap-theme">
            <option value="default">Default</option>
			<option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </div>

        <div class="ap-group">
          <div class="ap-hint mono">Changes affect this report only (no persistence yet).</div>
        </div>
      </div>
    </div>

  </body>
</html>`;
  }
}