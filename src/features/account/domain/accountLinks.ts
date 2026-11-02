import { z } from 'zod';

/** Where HoopLog's public pages live: the `site/` folder, published by GitHub Pages. */
export const DEFAULT_SITE_URL = 'https://datnguyenpt.github.io/hooplog/';

// The link in a confirmation email carries the player's sign-in, so it only ever goes over https.
// A query or fragment is refused too: page names are added after the address.
const siteUrlSchema = z.url({ protocol: /^https$/ }).refine((address) => !/[?#]/.test(address));

/**
 * The address of the site, ending in exactly one slash. A build can point at another site (a
 * custom domain, say) with `EXPO_PUBLIC_SITE_URL`; anything missing or unusable falls back on the
 * default, so a typo cannot stop anyone from signing up.
 */
export function siteUrl(configured: string | undefined): string {
  const parsed = siteUrlSchema.safeParse(configured?.trim());
  const address = parsed.success ? parsed.data : DEFAULT_SITE_URL;
  return address.endsWith('/') ? address : `${address}/`;
}

/** Where the confirmation email sends the player: a page that says the email is confirmed. */
export const confirmationUrl = (configured?: string): string => `${siteUrl(configured)}confirm/`;
