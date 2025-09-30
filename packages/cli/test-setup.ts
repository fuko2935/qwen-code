/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import './src/test-utils/customMatchers.js';

// Force consistent number formatting in tests regardless of system locale
const originalToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (locales?: string | string[], options?: Intl.NumberFormatOptions) {
  const forcedLocales = locales ?? 'en-US';
  return originalToLocaleString.call(this, forcedLocales as any, options as any);
};
