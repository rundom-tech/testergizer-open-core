import fg from "fast-glob";
import path from "path";

/**
 * Resolve CLI input paths and glob patterns into concrete file paths.
 * Works cross-platform (Windows-safe).
 */
export async function resolveInputFiles(
  inputs: string[]
): Promise<string[]> {
  if (!inputs.length) {
    throw new Error("No input paths provided.");
  }

  // Normalize Windows backslashes for glob engine
  const patterns = inputs.map(p => p.replace(/\\/g, "/"));

  const matches = await fg(patterns, {
    onlyFiles: true,
    unique: true,
    absolute: true
  });

  if (matches.length === 0) {
    throw new Error(
      `No files matched the provided path(s):\n` +
      patterns.map(p => `  - ${p}`).join("\n")
    );
  }

  // Normalize back to OS-native paths
  return matches.map(p => path.normalize(p));
}
