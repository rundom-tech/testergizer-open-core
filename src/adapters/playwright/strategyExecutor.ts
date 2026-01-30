import type { Locator, Page } from '@playwright/test';
import type { LocatorStrategy, StrategyExecutor } from '../../core/locators/types';

export class PlaywrightStrategyExecutor implements StrategyExecutor<Locator> {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async tryResolve(strategy: LocatorStrategy): Promise<Locator | null> {
    const locator = this.toLocator(strategy);

    // Deterministic existence check: count() is stable and doesn't click/type.
    // No custom waits, no retries.
    const count = await locator.count();
    return count > 0 ? locator : null;
  }

  private toLocator(s: LocatorStrategy): Locator {
    switch (s.by) {
      case 'css':
        return this.page.locator(s.value);

      case 'xpath':
        // Playwright supports `locator("xpath=...")`
        return this.page.locator(`xpath=${s.value}`);

      case 'testId':
        return this.page.getByTestId(s.value);

      case 'role':
        return this.page.getByRole(s.value as any, s.name ? { name: s.name } : undefined);

      case 'text':
        // value is the text; name is unused here
        return this.page.getByText(s.value);

      case 'aria':
        // Use aria-label / accessible name pattern via locator
        // Kept simple and explicit
        return this.page.locator(`[aria-label="${cssEscape(s.value)}"]`);

      default:
        // Exhaustive check
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _never: never = s.by;
        throw new Error(`Unsupported locator strategy: ${String(s.by)}`);
    }
  }
}

function cssEscape(x: string): string {
  // Minimal safe escape for quotes/backslashes
  return x.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
