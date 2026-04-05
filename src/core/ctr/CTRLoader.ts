// src/core/ctr/CTRLoader.ts

import * as fs from "fs";
import * as path from "path";
import { CCTRManager } from "./CCTRManager";

export class CTRLoader {
  private manager: CCTRManager;

  constructor(manager: CCTRManager) {
    this.manager = manager;
  }

  /**
   * Orchestrates the loading of federated registries.
   * Quality Intelligence: Local SUT definitions always take precedence over Global noise.
   */
  public async loadFederatedRegistries(localConfig: { sdrPath?: string, globalUrl?: string }): Promise<void> {
    let globalData: Record<string, any> = {};
    let localData: Record<string, any> = {};

    // 1. Load Tier 1: Global/Ecosystem Registry
    if (localConfig.globalUrl) {
      try {
        const response = await fetch(localConfig.globalUrl);
        globalData = (await response.json()) as Record<string, any>;
      } catch (error) {
        console.warn(`[CTRLoader] Could not fetch Global CCTR from ${localConfig.globalUrl}. Proceeding with local only.`);
      }
    }

    // 2. Load Tier 2: SUT-Specific Registry
    if (localConfig.sdrPath) {
      const fullPath = path.resolve(localConfig.sdrPath);
      if (fs.existsSync(fullPath)) {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          localData = JSON.parse(raw);
        } catch (error) {
          throw new Error(`[CTRLoader] Failed to parse local registry at ${fullPath}`);
        }
      }
    }

    // 3. Initialize the Manager with the merged datasets
    await this.manager.initialize(globalData, localData);
  }
}