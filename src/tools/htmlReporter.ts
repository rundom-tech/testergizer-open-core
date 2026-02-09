// src/tools/htmlReporter.ts
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
}

export class HtmlReporter {
  private readonly outputDir: string;

  // Frozen branding asset locations (repo-root relative)
  private static readonly BRANDING_PRODUCT = "branding/vendor/product.png"; // Testergizer logo (optional)
  private static readonly BRANDING_VENDOR = "branding/vendor/vendor.png"; // RunDOM logo (mandatory - provenance marker)
  private static readonly BRANDING_CUSTOMER = "branding/customer/customer.png"; // Customer logo (optional)

  constructor(opts: HtmlReporterOptions) {
    this.outputDir = path.resolve(opts.outputDir);

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

    const badge = (result: string) => `<span class="badge badge-${esc(result)}">${esc(result)}</span>`;

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

    const debugWarningsDoc = tryReadJson(path.join(this.outputDir, "debug-warnings.json"));
    const debugWarnings: any[] =
      debugWarningsDoc && typeof debugWarningsDoc === "object" && Array.isArray(debugWarningsDoc.warnings)
        ? debugWarningsDoc.warnings
        : [];

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
          const rel = String(o?.artifact?.path || "");
          // Prefer relative paths in the report (so report remains portable inside the runOutDir)
          const href = rel.startsWith(this.outputDir) ? rel.slice(this.outputDir.length + 1) : rel;
          const label = o?.type ? String(o.type) : "evidence";
          return `<a class="evidence" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(
            label
          )}</a>`;
        })
        .join(" ");
      return `<div class="evidence-row">${links}</div>`;
    };

    const renderStepRow = (step: any, testId: string, attempt: number) => {
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

      return `
        <tr>
          <td class="mono">${esc(step.id)}</td>
          <td>${esc(step.action)}</td>
          <td>${badge(step.status)}</td>
          <td class="mono">${esc(step.attempts)}</td>
          <td class="mono">${esc(step.startedAt)}</td>
          <td class="mono">${esc(step.endedAt)}</td>
          <td class="mono">${esc(fmtMs(step.durationMs))}</td>
          <td>${errHtml}${evidence}${originHtml}</td>
        </tr>
      `;
    };

    const renderAttempt = (a: TestAttemptResult, testId: string) => {
      const attErrors = Array.isArray((a as any).errors) ? (a as any).errors : [];

      const headerBits: string[] = [];
      headerBits.push(`<span class="k">Attempt</span> <span class="mono">#${esc((a as any).attempt)}</span>`);
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
        <div class="attempt">
          <div class="attempt-header">${headerBits.join(" ")}</div>
          ${attemptEvidence}
          ${attemptErrorsHtml}
          <table class="table">
            <thead>
              <tr>
                <th>id</th>
                <th>action</th>
                <th>status</th>
                <th>attempts</th>
                <th>started</th>
                <th>ended</th>
                <th>duration</th>
                <th>details</th>
              </tr>
            </thead>
            <tbody>
              ${steps.map((s: any) => renderStepRow(s, testId, (a as any).attempt)).join("")}
            </tbody>
          </table>
        </div>
      `;
    };

    const renderTestCard = (t: TestResult, idx: number) => {
      const attempts = Array.isArray((t as any).attempts) ? (t as any).attempts : [];
      return `
        <details class="card" ${idx === 0 ? "open" : ""}>
          <summary>
            <div class="card-title">
              <span class="title">${esc(t.id)}</span>
              ${badge((t as any).result)}
              <span class="muted mono">${esc((t as any).startedAt)} → ${esc((t as any).endedAt)}</span>
              <span class="mono">${esc(fmtMs((t as any).durationMs))}</span>
            </div>
            <div class="card-meta mono">project: ${esc((t as any).projectId)} <span class="sep">|</span> attempts: ${esc(
        attempts.length
      )}</div>
          </summary>

          <div class="card-body">
            <div class="section">
              <div class="section-title">Attempts</div>
              ${attempts.map((a: any) => renderAttempt(a, t.id)).join("")}
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

    const summary = `
      <div class="summary">
        <div class="summary-item"><div class="k">total</div><div class="v mono">${esc((run as any).summary.total)}</div></div>
        <div class="summary-item"><div class="k">passed</div><div class="v mono">${esc((run as any).summary.passed)}</div></div>
        <div class="summary-item"><div class="k">failed</div><div class="v mono">${esc((run as any).summary.failed)}</div></div>
        <div class="summary-item"><div class="k">aborted</div><div class="v mono">${esc((run as any).summary.aborted)}</div></div>
      </div>
    `;

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

    const debugSection = debugWarnings.length
      ? `
      <div class="debug-banner">
        ⚠️ DEBUG MODE — Reusable purity rules were relaxed. See <a href="./debug-warnings.json" target="_blank" rel="noopener noreferrer">debug-warnings.json</a>
      </div>
      <div class="content">
        <div class="section-title">Warnings</div>
        <div class="warnings">
          ${debugWarnings
            .map((w: any) => {
              const stack = Array.isArray(w.includeStack) ? w.includeStack.join(" → ") : "";
              return `
                <div class="warning">
                  <div class="mono"><span class="k">executable:</span> ${esc(w.originExecutableId)} <span class="sep">|</span> <span class="k">field:</span> ${esc(w.field)} <span class="sep">|</span> <span class="k">step:</span> ${esc(w.stepId)}</div>
                  <div class="mono muted">${esc(w.message)}</div>
                  <div class="mono muted"><span class="k">path:</span> ${esc(w.originPath)}</div>
                  <div class="mono muted"><span class="k">stack:</span> ${esc(stack)}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `
      : "";

    const list = `
      ${debugSection}
      <div class="content">
        <div class="section-title">Tests</div>
        ${tests.map((t: any, idx: number) => renderTestCard(t, idx)).join("")}
      </div>
    `;

    const footer = `
      <div class="footer">
        Powered by Testergizer | Copyright 2025 © RunDOM Technologies
      </div>
    `;

    const runMeta = `
      <div class="run-meta">
        <div><span class="k">Suite:</span> <span class="mono">${esc(run.suiteId)}</span></div>
        ${run.suiteName ? `<div><span class="k">Suite name:</span> ${esc(run.suiteName)}</div>` : ""}
        <div><span class="k">Run ID:</span> <span class="mono">${esc(run.runId)}</span></div>
        <div><span class="k">Project:</span> <span class="mono">${esc(run.projectId)}</span></div>
        <div><span class="k">Execution type:</span> <span class="mono">${esc(run.executionType)}</span></div>
        <div><span class="k">Execution intent:</span> <span class="mono">${esc(run.executionIntent)}</span></div>
        <div><span class="k">Started at:</span> <span class="mono">${esc(run.startedAt)}</span></div>
        <div><span class="k">Ended at:</span> <span class="mono">${esc(run.endedAt)}</span></div>
        <div><span class="k">Duration:</span> <span class="mono">${fmtMs(run.durationMs)}</span></div>
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

    // NOTE:
    // - report.html lives in artifacts/suiteId/date/runId/
    // - repo root is ../../../../
    // - base layout css currently lives under src/tools/
    // - themes live under themes/<name>/theme.css
    const layoutCssHref = "../../../../src/tools/report.layout.css";
    const defaultThemeHref = "../../../../themes/default/theme.css";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(run.applicationName)} Automated Tests Run Report</title>

    <!-- Base layout (structure, spacing, grids, typography) -->
    <link rel="stylesheet" href="${esc(layoutCssHref)}" />

    <!-- Active theme (tokens only: colors, borders, accents) -->
    <link id="tg-theme" rel="stylesheet" href="${esc(defaultThemeHref)}" />
  </head>

  <body>
    ${header}
    ${runMeta}
    ${summary}
    ${actions}
    ${list}
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

        /* Expand / Collapse */
        if (t.matches('[data-action="expand-all"]')) {
          expandAll();
          return;
        }

        if (t.matches('[data-action="collapse-all"]')) {
          collapseAll();
          return;
        }

        /* View ▾ button */
        if (t.matches('[data-action="view"]')) {
          if (!viewMenu) return;

          if (viewMenu.hidden) {
            show(viewMenu);
            var r = t.getBoundingClientRect();
            viewMenu.style.position = 'absolute';
            viewMenu.style.top = (r.bottom + 6) + 'px';
            viewMenu.style.left = r.left + 'px';
          } else {
            hide(viewMenu);
          }
          return;
        }

        /* View → Appearance */
        if (t.matches('[data-action="open-appearance"]')) {
          hide(viewMenu);
          show(appearancePanel);
          return;
        }

        /* Click on backdrop closes appearance */
        if (t.classList.contains('ap-backdrop')) {
          hide(appearancePanel);
          return;
        }

        /* Click outside view menu closes it */
        if (viewMenu && !viewMenu.contains(t) && !t.matches('[data-action="view"]')) {
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
    <!-- View menu (popup) -->
    <div id="view-menu" hidden>
      <button class="menu-item" data-action="open-appearance">
        Appearance
      </button>
    </div>

    <!-- Appearance panel (floating) -->
    <div id="appearance-panel" hidden>
      <div class="ap-backdrop"></div>
      <div class="appearance-panel">
        <div class="ap-title">Appearance</div>
        <div class="ap-group">
          <div class="ap-label">Theme</div>
          <select id="ap-theme">
            <option value="default">Default</option>
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
