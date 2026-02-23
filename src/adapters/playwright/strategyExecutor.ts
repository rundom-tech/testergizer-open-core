import type { Locator, Page } from '@playwright/test';
import type { ClrSelector, StrategyExecutor } from '../../core/locators/types';

export class PlaywrightStrategyExecutor implements StrategyExecutor<Locator> {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async tryResolve(selector: ClrSelector): Promise<Locator | null> {
    const locator = this.toLocator(selector);

    // Deterministic existence check: count() is stable and doesn't click/type.
    // No custom waits, no retries.
    const count = await locator.count();
    return count > 0 ? locator : null;
  }

  private toLocator(s: ClrSelector): Locator {
    switch (s.using) {
      case 'css':
        return this.page.locator(s.value);

      case 'xpath':
        // Playwright supports `locator("xpath=...")`
        return this.page.locator(`xpath=${s.value}`);

      case 'testid':
        return this.page.getByTestId(s.value);

      case 'role':
        return this.page.getByRole(s.value as any);

      case 'text':
        // value is the text; name is unused here
        return this.page.getByText(s.value);

      case 'aria':
        // Use aria-label / accessible name pattern via locator
        // Kept simple and explicit
        return this.page.locator(`[aria-label="${cssEscape(s.value)}"]`);
        
      case 'label':
        return this.page.getByLabel(s.value);
      case 'placeholder':
        return this.page.getByPlaceholder(s.value);

      default:
        // Exhaustive check
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _never: never = s.using;
        throw new Error(`Unsupported locator strategy: ${String(s.using)}`);
    }
  }
}

function cssEscape(x: string): string {
  // Minimal safe escape for quotes/backslashes
  return x.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
