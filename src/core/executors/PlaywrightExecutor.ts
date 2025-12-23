import { StepExecutor } from "./StepExecutor";
import { JsonStep } from "../types";
import { Page } from "playwright";

export class PlaywrightExecutor implements StepExecutor {
  async execute(step: JsonStep, page: Page | null): Promise<void> {
    if (!page) throw new Error("Playwright executor requires a page");
    const timeout = step.timeoutMs ?? 10000;

    switch (step.action) {
      case "goto":
        if (!step.target) throw new Error("goto requires target");
        await page.goto(step.target, { timeout });
        break;
      case "click":
        if (!step.target) throw new Error("click requires target");
        await page.click(step.target, { timeout });
        break;
      case "fill":
        if (!step.target) throw new Error("fill requires target");
        await page.fill(step.target, String(step.value ?? ""), { timeout });
        break;
      case "assertVisible":
        if (!step.target) throw new Error("assertVisible requires target");
        await page.waitForSelector(step.target, { timeout, state: "visible" });
        break;
      case "assertText":
        if (!step.target || step.value === undefined) {
          throw new Error("assertText requires target and value");
        }
        await page.waitForSelector(step.target, { timeout });
        const text = await page.textContent(step.target);
        if (!text?.includes(String(step.value))) {
          throw new Error(`Expected text "${step.value}" in selector ${step.target}, got "${text}"`);
        }
        break;
      case "waitFor":
        await page.waitForTimeout(Number(step.value) || 1000);
        break;
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }
}