/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import { setSimulate429 } from './src/utils/testUtils.js';

// Disable 429 simulation globally for all tests
setSimulate429(false);

// Some dependencies (e.g., undici) expect a global File constructor in Node.
// Provide a minimal shim for test environment if missing.
if (typeof (globalThis as unknown as { File?: unknown }).File === 'undefined') {
  (globalThis as unknown as { File: unknown }).File = class {} as unknown;
}

// Force consistent number formatting in tests regardless of system locale
const originalToLocaleString = Number.prototype.toLocaleString as (
  this: number,
  locales?: string | string[],
  options?: Intl.NumberFormatOptions,
) => string;
Number.prototype.toLocaleString = function (
  locales?: string | string[],
  options?: Intl.NumberFormatOptions,
) {
  const forcedLocales = locales ?? 'en-US';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return originalToLocaleString.call(
    this as any,
    forcedLocales as any,
    options as any,
  );
};
