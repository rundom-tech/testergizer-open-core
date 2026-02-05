import fs from "fs";
import path from "path";

import type { RunResult, TestAttemptResult, TestResult } from "../core/resultTypes";
import type { ArtifactsIndex } from "./artifactObserver";
import { runMain } from "module";

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
    return path
      .relative(path.dirname(reportHtmlPath), absBrand)
      .replace(/\\/g, "/");
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

    /* =========================
     * Branding rendering (frozen paths)
     * ========================= */

    const renderBrandImg = (repoRel: string, alt: string, cls?: string) => {
      if (!this.brandingExists(repoRel)) return "";
      const src = this.computeBrandingSrc(reportHtmlPath, repoRel);
      return `<img class="logo ${cls ?? ""}" src="${esc(src)}" alt="${esc(alt)}" />`;
    };

    const observations = Array.isArray(artifacts?.observations)
      ? (artifacts!.observations as any[])
      : [];

    const obsForAttempt = (testId: string, attempt: number) =>
      observations.filter((o) => o?.execution?.testId === testId && o?.execution?.attempt === attempt);

    const obsForStep = (testId: string, attempt: number, stepId: string) =>
      observations.filter(
        (o) =>
          o?.execution?.testId === testId &&
          o?.execution?.attempt === attempt &&
          o?.execution?.stepId === stepId
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

      return `
        <tr>
          <td class="mono">${esc(step.id)}</td>
          <td>${esc(step.action)}</td>
          <td>${badge(step.status)}</td>
          <td class="mono">${esc(step.attempts)}</td>
          <td class="mono">${esc(step.startedAt)}</td>
          <td class="mono">${esc(step.endedAt)}</td>
          <td class="mono">${esc(fmtMs(step.durationMs))}</td>
          <td>${errHtml}${evidence}</td>
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
                <th>stepId</th>
                <th>action</th>
                <th>status</th>
                <th>attempts</th>
                <th>startedAt</th>
                <th>endedAt</th>
                <th>duration</th>
                <th>errors / evidence</th>
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
      const title = `${idx + 1}. ${t.name ? t.name : t.id}`;
      const meta = [
        `<span class="k">id</span> <span class="mono">${esc(t.id)}</span>`,
        `<span class="k">project</span> <span class="mono">${esc((t as any).projectId)}</span>`,
        `<span class="k">mode</span> <span class="mono">${esc((t as any).executionMode)}</span>`,
        `<span class="k">domain</span> <span class="mono">${esc((t as any).testDomain)}</span>`,
        `<span class="k">duration</span> <span class="mono">${esc(fmtMs((t as any).durationMs))}</span>`
      ].join(" ");

      return `
        <details class="card" id="test-${esc(t.id)}">
          <summary>
            <div class="card-title">
              <span class="title">${esc(title)}</span>
              ${badge((t as any).result)}
              <span class="muted mono">${esc((t as any).startedAt)} → ${esc((t as any).endedAt)}</span>
            </div>
            <div class="card-meta">${meta}</div>
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

    const list = `
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
        <div><span class="k">Execution mode:</span> <span class="mono">${esc(run.executionMode)}</span></div>
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
      </div>
    `;


    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(run.applicationName)} Automated Tests Run Report</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; padding: 0; }
      a { color: inherit; }

      .header { padding: 18px 22px; border-bottom: 1px solid rgba(120,120,120,0.25); position: sticky; top: 0; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); z-index: 10; }
      @media (prefers-color-scheme: dark) { .header { background: rgba(10,10,10,0.88); } }

      .header-grid { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: start; }
      .header-left, .header-right { display: flex; align-items: center; }
      .header-center { min-width: 0; }

      .logo { display: block; }
      .logo-large { height: 52px; width: auto; max-width: 260px; object-fit: contain; }

      .h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; text-align: center; }
      
      .app-name {
        color: #1f2937; /* strong, near-black */
      }

      @media (prefers-color-scheme: dark) {
        .app-name {
          color: #f9fafb;
        }
      }

      .report-title {
        color: rgba(120,120,120,0.85);
        margin-left: 6px;
        font-weight: 500;
      }

      .meta { font-size: 13px; line-height: 1.4; text-align: center; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .muted { opacity: 0.72; }
      .sep { margin: 0 8px; opacity: 0.5; }
      .k { opacity: 0.7; margin-right: 4px; }

      .run-meta { padding: 14px 22px; }
      .run-meta > div { padding: 2px; }

      .summary { display: flex; justify-content: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
      .summary-item { border: 1px solid rgba(120,120,120,0.25); border-radius: 10px; padding: 8px 10px; min-width: 90px; text-align: center; }
      .summary-item .k { display: block; font-size: 12px; margin-bottom: 4px; }
      .summary-item .v { font-size: 18px; font-weight: 700; }

      .actions { margin-top: 12px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
      .btn { border: 1px solid rgba(120,120,120,0.25); background: transparent; border-radius: 10px; padding: 6px 10px; cursor: pointer; font-size: 13px; text-decoration: none; }
      .btn:hover { border-color: rgba(120,120,120,0.55); }

      .content { padding: 18px 22px; }
      .section-title { font-weight: 700; margin: 14px 0 10px; }

      details.card { border: 1px solid rgba(120,120,120,0.25); border-radius: 14px; padding: 10px 12px; margin-bottom: 12px; }
      details.card summary { cursor: pointer; list-style: none; }
      details.card summary::-webkit-details-marker { display: none; }

      .card-title { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .title { font-weight: 700; }
      .card-meta { margin-top: 6px; font-size: 12px; opacity: 0.8; }
      .card-body { margin-top: 10px; }

      .section { margin-top: 12px; }
      .attempt { border: 1px solid rgba(120,120,120,0.22); border-radius: 12px; padding: 10px; margin-top: 10px; }
      .attempt-header { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }

      .evidence-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 6px 0 2px; }
      .evidence { border: 1px solid rgba(120,120,120,0.25); border-radius: 999px; padding: 2px 8px; font-size: 12px; text-decoration: none; }
      .evidence:hover { border-color: rgba(120,120,120,0.55); }

      .pill { border: 1px solid rgba(120,120,120,0.25); border-radius: 999px; padding: 2px 8px; font-size: 12px; }
      .badge { border-radius: 999px; padding: 2px 10px; font-size: 12px; border: 1px solid rgba(120,120,120,0.25); }

      .table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
      .table th, .table td { border-bottom: 1px solid rgba(120,120,120,0.2); padding: 6px 6px; vertical-align: top; }
      .table th { text-align: left; opacity: 0.8; }

      .errors summary { cursor: pointer; }
      .error { margin-top: 8px; }
      .stack { white-space: pre-wrap; padding: 8px; border: 1px solid rgba(120,120,120,0.25); border-radius: 10px; overflow-x: auto; }

      .footer { padding: 18px 22px; border-top: 1px solid rgba(120,120,120,0.25); margin-top: 18px; text-align: center; font-size: 12px; opacity: 0.78; }
    </style>
  </head>
  <body>        
    ${header}
    ${runMeta}
    ${summary}
    ${actions}
    ${list}
    ${footer}
    <script>
      (function() {
        function setAll(open) {
          document.querySelectorAll('details.card').forEach(function(d) { d.open = open; });
        }
        document.querySelectorAll('[data-action="expand-all"]').forEach(function(b) {
          b.addEventListener('click', function() { setAll(true); });
        });
        document.querySelectorAll('[data-action="collapse-all"]').forEach(function(b) {
          b.addEventListener('click', function() { setAll(false); });
        });
      })();
    </script>
  </body>
</html>`;
  }
}
