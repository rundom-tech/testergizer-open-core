import type { Page } from "playwright";
import type { JsonStep } from "../types";
import type { StepExecutor } from "./StepExecutor";

export class PlaywrightExecutor implements StepExecutor {
  async execute(step: JsonStep, page: Page | null): Promise<void> {
    if (!page) throw new Error("PlaywrightExecutor requires a Page instance");

    const timeout = step.timeoutMs ?? 10000;

    switch (step.action) {
      case "goto": {
        if (!step.target) throw new Error("goto requires target (URL)");
        await page.goto(String(step.target), { timeout });
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
          // Leverage Playwright's native URL polling to safely wait for navigation
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