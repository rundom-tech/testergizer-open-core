import type { Page } from "playwright";
import type { JsonStep } from "../types";
import type { StepExecutor } from "./StepExecutor";
import { ExecutionContext } from "../context/ExecutionContext";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export class PlaywrightExecutor implements StepExecutor {
  async execute(step: JsonStep, page: Page | null, sharedContext?: ExecutionContext): Promise<void> {
    if (!page) throw new Error("PlaywrightExecutor requires a Page instance");
    
    // Wire up the shared context so UI extractions can pass into the FS domain
    const context = sharedContext || new ExecutionContext();

    // Attach a passive download listener once per page instance.
    // This intercepts the stream and routes it to the defined Quality Intelligence boundary.
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
          if (error && error.message && error.message.includes("canceled")) {
            return; // Silently absorb the cancellation caused by early test teardown
          }
          console.error("[PlaywrightExecutor] Download interception failed:", error);
        }
      });
    }

    const timeout = step.timeoutMs ?? 10000;

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
          
          // Quality Intelligence: If extracting an href, safely parse out just the filename
          if (attrName === "href" && extractedValue.includes("/")) {
            extractedValue = extractedValue.split("/").pop() || extractedValue;
          }
        }

        // Bind the concrete state to the execution context
        context.set(extractAs, extractedValue);
        (step as any).data = { extracted: { [extractAs]: extractedValue } };
        return;
      }

      case "upload": {
        if (!step.target) throw new Error("upload requires target (selector)");
        if (!step.value) throw new Error("upload requires value (file path)");
        
        const rawPath = String(step.value);
        const resolvedPath = path.resolve(rawPath);
        
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
        if (step.value === undefined || step.value === null) {
          throw new Error("assertText requires value");
        }
        await page.waitForSelector(String(step.target), { timeout });
        const text = await page.textContent(String(step.target));
        const expected = String(step.value);
        if (!text || !text.includes(expected)) {
          throw new Error(`Expected text to include "${expected}" at ${step.target}. Got: "${text ?? ""}"`);
        }
        return;
      }

      case "assertUrl": {
        if (step.value === undefined || step.value === null) {
          throw new Error("assertUrl requires value");
        }
        
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
}