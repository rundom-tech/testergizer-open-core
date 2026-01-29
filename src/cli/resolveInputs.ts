import fg from "fast-glob";
import path from "path";

/**
 * Resolve CLI input paths and glob patterns into concrete file paths.
 * Works cross-platform (Windows-safe).
 */
export async function resolveInputFiles(inputs: string[]): Promise<string[]> {
  if (!inputs.length) {
    throw new Error("No input paths provided.");
  }

  // Normalize Windows backslashes for glob engine
  const patterns = inputs.map((p) => p.replace(/\\/g, "/"));

  const matches = await fg(patterns, {
    onlyFiles: true,
    unique: true,
    absolute: true,
  });

  if (matches.length === 0) {
    throw new Error(
      `No files matched the provided path(s):\n` +
        patterns.map((p) => `  - ${p}`).join("\n")
    );
  }

  // Normalize back to OS-native paths
  return matches.map((p) => path.normalize(p));
}

/**
 * =========================
 * Secrets + Context (V1)
 * =========================
 *
 * Key invariants (as frozen with you):
 * - Root scripts define a static `context` map.
 * - Reusables do not accept args. They only reference {{VARS}} from root context.
 * - Secrets are never stored in JSON; only references: { "$secret": "NAME" }.
 * - Sandbox mode resolves NO secrets unless explicitly injected.
 * - No crypto theater. Just indirection + masking downstream.
 */

export type ContextValue =
  | string
  | number
  | boolean
  | null
  | { $secret: string };

export type RootContext = Record<string, ContextValue>;

export interface ResolvedContext {
  /** Effective context (in-memory), with secrets resolved to strings. */
  values: Record<string, string>;
  /** Which context keys are secret-backed (came from {$secret: ...}). */
  secretVars: Set<string>;
}

export interface SecretResolver {
  resolve(name: string): string | undefined;
}

export class EnvSecretResolver implements SecretResolver {
  resolve(name: string): string | undefined {
    const v = process.env[name];
    if (v === undefined || v === "") return undefined;
    return v;
  }
}

export class InjectedMapSecretResolver implements SecretResolver {
  constructor(private readonly secrets: Record<string, string>) {}
  resolve(name: string): string | undefined {
    const v = this.secrets[name];
    if (v === undefined || v === "") return undefined;
    return v;
  }
}

export class CompositeSecretResolver implements SecretResolver {
  constructor(private readonly resolvers: SecretResolver[]) {}
  resolve(name: string): string | undefined {
    for (const r of this.resolvers) {
      const v = r.resolve(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }
}

/**
 * Parse repeated CLI flags of the form: --secret KEY=VALUE
 * Returns a map of injected secrets (in-memory only).
 */
export function parseInjectedSecrets(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of pairs) {
    const idx = raw.indexOf("=");
    if (idx <= 0 || idx === raw.length - 1) {
      throw new Error(`Invalid --secret value (expected KEY=VALUE): ${raw}`);
    }
    const k = raw.slice(0, idx).trim();
    const v = raw.slice(idx + 1);
    if (!k) throw new Error(`Invalid --secret key: ${raw}`);
    out[k] = v;
  }
  return out;
}

function isSecretRef(v: unknown): v is { $secret: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["$secret"] === "string" && Object.keys(o).length === 1;
}

function toStringValue(v: string | number | boolean | null): string {
  if (v === null) return "null";
  return String(v);
}

/**
 * Resolve a root `context` to an effective string map.
 *
 * sandbox = true:
 *  - does NOT consult environment resolver implicitly
 *  - only injected secrets are allowed (if provided)
 */
export function resolveRootContext(args: {
  context: RootContext | undefined;
  sandbox: boolean;
  injectedSecrets?: Record<string, string>;
  envSecrets?: boolean; // non-sandbox default true; sandbox default false
}): ResolvedContext {
  const ctx = args.context ?? {};
  const secretVars = new Set<string>();
  const values: Record<string, string> = {};

  const injected = new InjectedMapSecretResolver(args.injectedSecrets ?? {});
  const useEnv = args.envSecrets ?? (!args.sandbox);

  const resolver: SecretResolver = args.sandbox
    ? new CompositeSecretResolver([injected]) // sandbox = explicit only
    : new CompositeSecretResolver(
        useEnv ? [injected, new EnvSecretResolver()] : [injected]
      );

  for (const [key, raw] of Object.entries(ctx)) {
    if (isSecretRef(raw)) {
      secretVars.add(key);
      const name = raw.$secret;
      const resolved = resolver.resolve(name);
      if (resolved === undefined) {
        if (args.sandbox) {
          throw new Error(
            `Sandbox mode: secret resolution disabled unless injected (missing ${name})`
          );
        }
        throw new Error(`Missing secret: ${name}`);
      }
      values[key] = resolved;
      continue;
    }

    // literals
    if (
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean" ||
      raw === null
    ) {
      values[key] = toStringValue(raw);
      continue;
    }

    // Anything else is invalid in v1.
    throw new Error(
      `Invalid context value for key "${key}". Allowed: string|number|boolean|null|{$secret:string}`
    );
  }

  return { values, secretVars };
}

/**
 * Strict interpolation: replaces {{NAME}} with root context values.
 * Missing variable => hard error.
 */
export function interpolateStringStrict(
  template: string,
  ctx: Record<string, string>
): string {
  return template.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, name: string) => {
    const v = ctx[name];
    if (v === undefined) {
      throw new Error(`Missing context variable: ${name}`);
    }
    return v;
  });
}

/**
 * Recursively interpolates all string fields in an object/array.
 * Designed for pre-run expansion into an "effective" steps array.
 */
export function interpolateDeepStrict<T>(
  input: T,
  ctx: Record<string, string>
): T {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return interpolateStringStrict(input, ctx) as T;
  if (Array.isArray(input)) {
    return input.map((x) => interpolateDeepStrict(x, ctx)) as T;
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = interpolateDeepStrict(v, ctx);
    }
    return out as T;
  }
  return input;
}
