import fs from "fs";
import { chromium } from "playwright";
import { runAssertion } from "./assertions";

export interface RunnerOptions {
  headless?: boolean;
}

export async function runSuiteFromFile(
  suitePath: string,
  options: RunnerOptions = {}
) {

  const raw = fs.readFileSync(suitePath, "utf-8");
  const suite = JSON.parse(raw);

  console.log(`Loaded suite: ${suite.suiteName}`);

  let failed = false;

  for (const test of suite.tests) {
    console.log(`\n=== Test: ${test.name} ===`);

    const browser = await chromium.launch({
        headless: options.headless !== false
   });

    const page = await browser.newPage();

    try {
      for (const step of test.steps) {
        if (step.disabled) {
          console.log(`↷ Step skipped: ${step.action}`);
          continue;
        }

        console.log("→ Step:", step.action);

        switch (step.action) {
          case "goto":
            await page.goto(step.url);
            break;

          case "assert":
            await runAssertion(page, step);
            break;

          default:
            throw new Error(`Unknown action: ${step.action}`);
        }
      }

      console.log(`✔ Test passed: ${test.name}`);
    } catch (err) {
      failed = true;
      console.error(`✖ Test failed: ${test.name}`);
      throw err;
    } finally {
      await browser.close();
    }
  }

  if (!failed) {
    console.log(`\n✔ Suite passed: ${suite.suiteName}`);
    process.exit(0);
  }
}
