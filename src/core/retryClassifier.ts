
export type RetryReason =
  | "timeout"
  | "assertion"
  | "navigation"
  | "unknown";

export function classifyRetry(err: any): RetryReason {
  const msg = String(err?.message ?? "");

  if (/timeout/i.test(msg)) return "timeout";
  if (/assertion failed/i.test(msg)) return "assertion";
  if (/page\.goto|navigation/i.test(msg)) return "navigation";

  return "unknown";
}
