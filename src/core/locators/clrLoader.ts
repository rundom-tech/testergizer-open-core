import { readFile } from "node:fs/promises";
import type { CLRDefinition } from "./clrDefinition";
import { validateLocatorDictionary } from "./validate";

export async function loadCLRFromFile(filePath: string): Promise<CLRDefinition> {
  const rawText = await readFile(filePath, "utf-8");
  const raw = JSON.parse(rawText);

  if (!raw || typeof raw !== "object") {
    throw new Error("CLR_INVALID: CLR file must be an object");
  }

  if (typeof raw.appId !== "string" || !raw.appId.trim()) {
    throw new Error("CLR_INVALID: appId is required");
  }

  if (typeof raw.versionRange !== "string" || !raw.versionRange.trim()) {
    throw new Error("CLR_INVALID: versionRange is required");
  }

  const locators = validateLocatorDictionary(raw.locators);

  return {
    appId: raw.appId,
    versionRange: raw.versionRange,
    domFingerprint:
      typeof raw.domFingerprint === "string"
        ? raw.domFingerprint
        : undefined,
    locators
  };
}
