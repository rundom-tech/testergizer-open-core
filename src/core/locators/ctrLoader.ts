import { readFile } from "node:fs/promises";
import type { CTRDefinition } from "./ctrDefinition";
import { validateLocatorDictionary } from "./validate";

export async function loadCTRFromFile(filePath: string): Promise<CTRDefinition> {
  const rawText = await readFile(filePath, "utf-8");
  const raw = JSON.parse(rawText);

  if (!raw || typeof raw !== "object") {
    throw new Error("CTR_INVALID: CTR file must be an object");
  }

  if (typeof raw.appId !== "string" || !raw.appId.trim()) {
    throw new Error("CTR_INVALID: appId is required");
  }

  if (typeof raw.versionRange !== "string" || !raw.versionRange.trim()) {
    throw new Error("CTR_INVALID: versionRange is required");
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
