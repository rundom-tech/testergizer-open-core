import { Page } from "playwright";

type AssertionFn = (page: Page, step: any) => Promise<void>;

const assertions: Record<string, AssertionFn> = {
  /* ======================================================
   * Presence & visibility
   * ====================================================== */

  exists: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element does not exist (${step.selector})`
      );
    }
  },

  visible: async (page, step) => {
    await page.waitForSelector(step.selector, { state: "visible" });
  },

  hidden: async (page, step) => {
    await page.waitForSelector(step.selector, { state: "hidden" });
  },

  /* ======================================================
   * Text assertions (for elements with textContent)
   * ====================================================== */

  textContains: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element not found (${step.selector})`
      );
    }

    const text = await el.textContent();
    if (!text || !text.includes(step.value)) {
      throw new Error(
        `Assertion failed: text does not contain "${step.value}". Actual: "${text}"`
      );
    }
  },

  textEquals: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element not found (${step.selector})`
      );
    }

    const text = (await el.textContent())?.trim();
    if (text !== step.value) {
      throw new Error(
        `Assertion failed: expected text "${step.value}", got "${text}"`
      );
    }
  },

  /* ======================================================
   * Attribute & value assertions
   * ====================================================== */

  valueContains: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element not found (${step.selector})`
      );
    }

    const value = await el.getAttribute("value");
    if (!value || !value.includes(step.value)) {
      throw new Error(
        `Assertion failed: value does not contain "${step.value}". Actual: "${value}"`
      );
    }
  },

  attributeEquals: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element not found (${step.selector})`
      );
    }

    if (!step.attribute) {
      throw new Error(
        `Assertion failed: attributeEquals requires "attribute" field`
      );
    }

    const attr = await el.getAttribute(step.attribute);
    if (attr !== step.value) {
      throw new Error(
        `Assertion failed: attribute "${step.attribute}" expected "${step.value}", got "${attr}"`
      );
    }
  },

  /* ======================================================
   * Enabled / disabled state
   * ====================================================== */

  enabled: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element not found (${step.selector})`
      );
    }

    const disabled = await el.getAttribute("disabled");
    if (disabled !== null) {
      throw new Error(
        `Assertion failed: element is disabled (${step.selector})`
      );
    }
  },

  disabled: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
      throw new Error(
        `Assertion failed: element not found (${step.selector})`
      );
    }

    const disabled = await el.getAttribute("disabled");
    if (disabled === null) {
      throw new Error(
        `Assertion failed: element is not disabled (${step.selector})`
      );
    }
  },

  placeholderEquals: async (page, step) => {
    const el = await page.$(step.selector);
    if (!el) {
        throw new Error(
        `Assertion failed: element not found (${step.selector})`
        );
    }

    const placeholder = await el.getAttribute("placeholder");
    if (placeholder !== step.value) {
        throw new Error(
        `Assertion failed: placeholder expected "${step.value}", got "${placeholder}"`
        );
    }
    },

    placeholderContains: async (page, step) => {
  const el = await page.$(step.selector);
  if (!el) {
    throw new Error(
      `Assertion failed: element not found (${step.selector})`
    );
  }

  const placeholder = await el.getAttribute("placeholder");
  if (!placeholder || !placeholder.includes(step.value)) {
    throw new Error(
      `Assertion failed: placeholder does not contain "${step.value}". Actual: "${placeholder}"`
    );
  }
},



  /* ======================================================
   * URL assertions
   * ====================================================== */

  urlContains: async (page, step) => {
    const url = page.url();
    if (!url.includes(step.value)) {
      throw new Error(
        `Assertion failed: URL does not contain "${step.value}". Actual: "${url}"`
      );
    }
  }
};

/* ========================================================
 * Public API
 * ======================================================== */

export async function runAssertion(
  page: Page,
  step: any
): Promise<void> {
  const type = step.assert;

  if (!type) {
    throw new Error(`Assertion step missing "assert" field`);
  }

  const fn = assertions[type];
  if (!fn) {
    throw new Error(
      `Unknown assertion type: ${type}. Supported assertions: ${Object.keys(
        assertions
      ).join(", ")}`
    );
  }

  await fn(page, step);
}
