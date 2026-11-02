/* global describe, it, expect, __dirname */
// Keeps the pages in step with each other. There is no build step, so the shared parts (the
// security rules in <head>, the two landing pages) are copied by hand and checked here.
const fs = require('fs');
const path = require('path');

const PAGES = [
  'index.html',
  'confirm/index.html',
  'delete-account/index.html',
  'account-deleted/index.html',
];
// The pages that landing.js fills in from what Supabase puts in the address.
const LANDINGS = ['index.html', 'confirm/index.html'];

const read = (page) => fs.readFileSync(path.join(__dirname, page), 'utf8').replace(/\r\n/g, '\n');
const policyOf = (html) =>
  /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';
const mainOf = (html) => /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
const addressesIn = (html) => [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);

describe.each(PAGES)('%s', (page) => {
  const html = read(page);

  it('is a complete page for a phone screen, with a heading for whatever it shows', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
    expect(html).toMatch(/<title>HoopLog: [^<]+<\/title>/);
    // A landing page shows one of its three sections, or the <noscript> text: each has its own.
    expect(html.match(/<h1>/g)).toHaveLength(LANDINGS.includes(page) ? 4 : 1);
  });

  it('keeps visitors and their address private', () => {
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });

  it('allows nothing from other sites and no inline code or styles', () => {
    const policy = policyOf(html);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toMatch(/unsafe-|\*|https?:/);
    expect(html).not.toMatch(/<style|\sstyle=|\son[a-z]+=/i);
  });

  it('runs a script only when it needs one, and only one from this site', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    if (LANDINGS.includes(page)) {
      expect(policyOf(html)).toContain("script-src 'self'");
      expect(scripts).toHaveLength(1);
      expect(scripts[0]).toMatch(/^<script src="(\.\.\/)?landing\.js">$/);
    } else {
      expect(policyOf(html)).toContain("script-src 'none'");
      expect(scripts).toHaveLength(0);
    }
  });

  it('links only to files that exist in this site, by relative address', () => {
    const addresses = addressesIn(html).filter((address) => !address.startsWith('data:'));
    expect(addresses).toContain(page.includes('/') ? '../site.css' : 'site.css');
    for (const address of addresses) {
      // The site lives under /hooplog/ on GitHub Pages: no address may start from the top.
      expect(address).not.toMatch(/^([a-z][a-z0-9+.-]*:|\/)/i);
      const file = path.resolve(path.dirname(path.join(__dirname, page)), address.split(/[?#]/)[0]);
      const target =
        fs.existsSync(file) && fs.statSync(file).isDirectory()
          ? path.join(file, 'index.html')
          : file;
      expect(fs.existsSync(target)).toBe(true);
    }
  });
});

describe('the landing pages', () => {
  it('have a section for every result landing.js can pick', () => {
    for (const page of LANDINGS) {
      for (const id of ['confirmed', 'problem', 'nothing']) {
        expect(read(page)).toContain(`<section id="${id}" hidden>`);
      }
    }
  });

  it('say exactly the same thing', () => {
    const [first, ...others] = LANDINGS.map((page) => mainOf(read(page)));
    expect(first).not.toBe('');
    for (const other of others) expect(other).toBe(first);
  });
});
