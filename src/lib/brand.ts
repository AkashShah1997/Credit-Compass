/**
 * Product identity, in one place.
 *
 * Everything that prints the app's name — the sidebar, the browser title, PDF
 * headers, export filenames, storage keys — reads from here, so a rename is a
 * one-line change rather than a hunt through the pages.
 */

export const APP_NAME = 'CreditCompass'

/** Short tagline shown under the logo. */
export const APP_TAGLINE = 'Credit health & money'

/** Two-letter fallback avatar when the user has no name set. */
export const APP_INITIALS = 'CC'

/** Prefix for exported files: `CreditCompass-2026-08-report.pdf`. */
export const FILE_PREFIX = APP_NAME

/** Local-storage namespace. Bumping the version here invalidates saved state. */
export const STORAGE_NAMESPACE = 'creditcompass'
