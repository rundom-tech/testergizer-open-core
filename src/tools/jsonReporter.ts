import fs from "fs";
import path from "path";

/**
 * JSON Reporter with Secret Masking (V1)
 *
 * Invariants:
 * - Secret values never leave memory
 * - Reporter is the single choke-point for persistence
 * - Masking is deterministic ("***")
 */

export interface JsonReporterOptions {
  outputDir: string;
  secretVars?: Set<string>;
}

const MASK = "***";

function sanitize(value: any, secretVars?: Set<string>): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (secretVars && secretVars.has(value)) {
      return MASK;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, secretVars));
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && secretVars && secretVars.has(v)) {
        out[k] = MASK;
      } else {
        out[k] = sanitize(v, secretVars);
      }
    }
    return out;
  }

  return value;
}

export class JsonReporter {
  private readonly outputDir: string;
  private readonly secretVars?: Set<string>;

  constructor(opts: JsonReporterOptions) {
    this.outputDir = opts.outputDir;
    this.secretVars = opts.secretVars;
  }

  write(filename: string, payload: any): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const sanitized = sanitize(payload, this.secretVars);
    const outPath = path.join(this.outputDir, filename);

    fs.writeFileSync(outPath, JSON.stringify(sanitized, null, 2), "utf-8");
  }
}
