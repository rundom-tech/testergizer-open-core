import fs from "fs";
import path from "path";

import type { ArtifactObserver } from "../core/types";

export interface ArtifactsIndex {
  schemaVersion: "v1";
  suiteId: string;
  runId: string;
  observations: unknown[];
}

export function ensureArtifactsIndex(params: {
  runOutDir: string;
  suiteId: string;
  runId: string;
}): string {
  const outPath = path.join(params.runOutDir, "artifacts.json");

  if (!fs.existsSync(params.runOutDir)) {
    fs.mkdirSync(params.runOutDir, { recursive: true });
  }

  if (!fs.existsSync(outPath)) {
    const doc: ArtifactsIndex = {
      schemaVersion: "v1",
      suiteId: params.suiteId,
      runId: params.runId,
      observations: []
    };
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf-8");
  }

  return outPath;
}

export function createArtifactObserver(params: {
  runOutDir: string;
  suiteId: string;
  runId: string;
}): ArtifactObserver {
  const outPath = ensureArtifactsIndex(params);

  return {
    append(entry: unknown) {
      // Append-only, crash-safe, no in-memory cache.
      const doc = JSON.parse(fs.readFileSync(outPath, "utf-8")) as ArtifactsIndex;
      doc.observations.push(entry);
      fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf-8");
    }
  };
}
