/**
 * Google Analytics 4, page views only (#207). Whether it loads and what the bootstrap says
 * are decided here, in pure code, so they can be unit-tested without a browser.
 *
 * Nothing about a note is ever sent: no content, title, tag or search text, and no user id
 * or email. The only event is the automatic page_view that `config` sends.
 */

export interface GaConfig {
  /** The gtag.js URL for the `<script async src>`. */
  src: string;
  /** Inline script that defines `gtag` and configures the property. */
  bootstrap: string;
}

// A GA4 measurement ID. The ID is interpolated into an inline script, so anything that is
// not exactly this shape must be refused rather than escaped.
const MEASUREMENT_ID = /^G-[A-Z0-9]+$/;

/**
 * `null` when there is no valid measurement ID: dev, tests and forks then never load the
 * script and the app makes no request to Google.
 */
export function gaConfig(measurementId: string | undefined): GaConfig | null {
  const id = measurementId?.trim();
  if (!id || !MEASUREMENT_ID.test(id)) return null;
  return {
    src: `https://www.googletagmanager.com/gtag/js?id=${id}`,
    bootstrap:
      `window.dataLayer = window.dataLayer || [];` +
      `function gtag(){dataLayer.push(arguments);}` +
      `gtag('js', new Date());` +
      `gtag('config', ${JSON.stringify(id)}, ` +
      `{anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false});`,
  };
}
