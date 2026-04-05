// src/core/ctr/CCTRManager.ts
import { LocatorDefinition, CtrSelector } from "./ctrTypes";

/**
 * Enhanced Locator for the Central Target Registry.
 * Extends the existing LocatorDefinition with Phase 14-ready tags.
 */
export interface CtrObstacle extends LocatorDefinition {
  isObstacle?: boolean;
  dismissalRef?: string;
}

export class CCTRManager {
  private registry: Map<string, CtrObstacle> = new Map();

  public async initialize(globalRegistry: any, localRegistry: any): Promise<void> {
    this.ingest(globalRegistry);
    this.ingest(localRegistry);
  }

  private ingest(data: any): void {
    if (data?.locators) {
      Object.entries(data.locators).forEach(([id, locator]) => {
        this.registry.set(id, locator as CtrObstacle);
      });
    }
  }

  public identifyObstacle(nodeInfo: { id?: string, className?: string, tagName?: string }): CtrObstacle | null {
    for (const item of this.registry.values()) {
      if (!item.isObstacle) continue;

      // Explicitly type 's' as CtrSelector to fix TS7006
      const isMatch = item.selectors.some((s: CtrSelector) => {
        if (s.using === "css") {
          if (nodeInfo.id && s.value.includes(`#${nodeInfo.id}`)) return true;
          if (nodeInfo.className) {
            const classes = nodeInfo.className.split(/\s+/);
            return classes.some(cls => s.value.includes(`.${cls}`));
          }
        }
        return false;
      });

      if (isMatch) return item;
    }
    return null;
  }

  public getLocator(id: string): CtrObstacle | null {
    return this.registry.get(id) || null;
  }
}