import { resolveInputFiles } from "./resolveInputs";
import { validateResults } from "../core/validateResults";

/**
 * CLI entry point for:
 *   testergizer validate <path|glob>...
 */
export async function validateCommand(
  inputArgs: string[]
): Promise<void> {
  if (!inputArgs.length) {
    throw new Error(
      "No input files provided.\n\n" +
      "Usage:\n" +
      "  testergizer validate <path|glob>...\n\n" +
      "Examples:\n" +
      "  testergizer validate artifacts/results_*.json\n" +
      "  testergizer validate artifacts/**/*.json"
    );
  }

  const files = await resolveInputFiles(inputArgs);

  await validateResults(files);
}
