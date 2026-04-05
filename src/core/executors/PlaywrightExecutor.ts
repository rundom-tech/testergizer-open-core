// src/core/executor/PlaywrightExecutor.ts

import type { Page } from "playwright";
import type { JsonStep } from "../types";
import type { StepExecutor } from "./StepExecutor";
import { ExecutionContext } from "../context/ExecutionContext";
import { CCTRManager } from "../ctr/CCTRManager";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Actions that require a clear Z-axis/line-of-sight before execution
const INTERACTIVE_ACTIONS = ["click", "fill", "upload", "select", "hover"];

export class PlaywrightExecutor implements StepExecutor {
  private cctrManager: CCTRManager;

  constructor(cctrManager: CCTRManager) {
    this.cctrManager = cctrManager;
  }

  async execute(step: JsonStep, page: Page | null, sharedContext?: ExecutionContext): Promise<void> {
    if (!page) throw new Error("PlaywrightExecutor requires a Page instance");
    
    // Wire up the shared context so UI extractions can pass into the FS domain
    const context = sharedContext || new ExecutionContext();

    // Attach a passive download listener once per page instance.
    if (!(page as any)._qiDownloadInterceptorBound) {
      (page as any)._qiDownloadInterceptorBound = true;
      
      page.on("download", async (download) => {
        try {
          const sandboxDir = path.join(os.homedir(), "Downloads", "maestro-sandbox");
          if (!fs.existsSync(sandboxDir)) {
            fs.mkdirSync(sandboxDir, { recursive: true });
          }
          const filePath = path.join(sandboxDir, download.suggestedFilename());
          await download.saveAs(filePath);
        } catch (error: any) {
          if (error?.message?.includes("canceled")) return;
          console.error("[PlaywrightExecutor] Download interception failed:", error);
        }
      });
    }

    const timeout = step.timeoutMs ?? 10000;

    // --- PHASE 14: PROACTIVE OBSTACLE CLEARANCE ---
    // Perform a pre-flight check for any action that interacts with the DOM
    if (INTERACTIVE_ACTIONS.includes(step.action) && step.target) {
      await this.resolveObstacles(page, String(step.target), timeout);
    }

    switch (step.action) {
      case "goto": {
        if (!step.target) throw new Error("goto requires target (URL)");
        await page.goto(String(step.target), { timeout });
        return;
      }

      case "extract": {
        if (!step.target) throw new Error("extract requires target (selector)");
        const extractAs = (step as any).extractAs;
        if (!extractAs) throw new Error("extract requires 'extractAs' to name the context variable");
        
        const property = (step as any).property || "textContent";
        let extractedValue = "";

        await page.waitForSelector(String(step.target), { timeout, state: "attached" });

        if (property === "textContent") {
          extractedValue = (await page.textContent(String(step.target)))?.trim() || "";
        } else if (property.startsWith("attribute:")) {
          const attrName = property.split(":")[1];
          extractedValue = (await page.getAttribute(String(step.target), attrName))?.trim() || "";
          
          if (attrName === "href" && extractedValue.includes("/")) {
            extractedValue = extractedValue.split("/").pop() || extractedValue;
          }
        }

        context.set(extractAs, extractedValue);
        (step as any).data = { extracted: { [extractAs]: extractedValue } };
        return;
      }

      case "upload": {
        if (!step.target) throw new Error("upload requires target (selector)");
        if (!step.value) throw new Error("upload requires value (file path)");
        
        const resolvedPath = path.resolve(String(step.value));
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Cannot upload. File not found at path: ${resolvedPath}`);
        }
        
        await page.setInputFiles(String(step.target), resolvedPath, { timeout });
        return;
      }

      case "click": {
        if (!step.target) throw new Error("click requires target (selector)");
        await page.click(String(step.target), { timeout });
        return;
      }

      case "fill": {
        if (!step.target) throw new Error("fill requires target (selector)");
        await page.fill(String(step.target), String(step.value ?? ""), { timeout });
        return;
      }

      case "assertVisible": {
        if (!step.target) throw new Error("assertVisible requires target (selector)");
        await page.waitForSelector(String(step.target), { timeout, state: "visible" });
        return;
      }

      case "assertText": {
        if (!step.target) throw new Error("assertText requires target (selector)");
        if (step.value === undefined || step.value === null) throw new Error("assertText requires value");
        
        await page.waitForSelector(String(step.target), { timeout });
        const text = await page.textContent(String(step.target));
        const expected = String(step.value);
        if (!text || !text.includes(expected)) {
          throw new Error(`Expected text to include "${expected}" at ${step.target}. Got: "${text ?? ""}"`);
        }
        return;
      }

      case "assertUrl": {
        if (step.value === undefined || step.value === null) throw new Error("assertUrl requires value");
        
        const expected = String(step.value);
        const matcher = (step as any).matcher || "equals";

        try {
          await page.waitForURL((url) => {
            const href = url.href;
            if (matcher === "endsWith") return href.endsWith(expected);
            if (matcher === "startsWith") return href.startsWith(expected);
            if (matcher === "contains" || matcher === "containsText") return href.includes(expected);
            return href === expected;
          }, { timeout });
        } catch (e) {
          throw new Error(`Expected URL to ${matcher} "${expected}". Got: "${page.url()}"`);
        }
        return;
      }

      case "waitFor": {
        const ms = Number(step.value ?? 1000);
        await page.waitForTimeout(Number.isFinite(ms) ? ms : 1000);
        return;
      }

      default:
        throw new Error(`Unknown step action: ${String((step as any).action)}`);
    }
  }

  /**
   * Proactive Reflex: Uses CDP to detect if the target is occluded by a known obstacle.
   */
  private async resolveObstacles(page: Page, targetSelector: string, timeout: number): Promise<void> {
    try {
      const targetElement = page.locator(targetSelector).first();
      const box = await targetElement.boundingBox();
      if (!box) return;

      const x = Math.round(box.x + box.width / 2);
      const y = Math.round(box.y + box.height / 2);

      // Evaluate the top-most element at the target's center point
      const topElement = await page.evaluate(({ x, y }) => {
      // Use globalThis or window cast to bypass the Node-side check
      const el = (globalThis as any).document.elementFromPoint(x, y);
      return el ? { id: el.id, className: el.className, tagName: el.tagName } : null;
    }, { x, y });

      if (!topElement) return;

      // Identify if this top element is a registered obstacle in the CCTR
      const obstacle = this.cctrManager.identifyObstacle(topElement);

      if (obstacle?.isObstacle && obstacle.dismissalRef) {
        const dismissal = this.cctrManager.getLocator(obstacle.dismissalRef);
        if (dismissal && dismissal.selectors.length > 0) {
          // Use the primary selector to clear the obstacle
          const selector = dismissal.selectors[0].value;
          
          await page.click(selector, { timeout: 5000 });
          console.log(`[OBSTACLE_CLEARED] Dismissed ${obstacle.dismissalRef} to reach ${targetSelector}`);
          
          // Recursive check to ensure the path is now fully clear (e.g., stacked modals)
          await this.resolveObstacles(page, targetSelector, timeout);
        }
      }
    } catch (error) {
      // Best-effort: if the reflex fails, allow the main execution to attempt the action and fail normally
      return;
    }
  }
}