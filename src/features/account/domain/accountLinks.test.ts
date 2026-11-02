import { existsSync } from 'fs';
import { join } from 'path';

import { DEFAULT_SITE_URL, confirmationUrl, siteUrl } from './accountLinks';

describe('siteUrl', () => {
  it('is the HoopLog site unless a build says otherwise', () => {
    expect(siteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(siteUrl('')).toBe(DEFAULT_SITE_URL);
    expect(siteUrl('   ')).toBe(DEFAULT_SITE_URL);
  });

  it('takes another https address and ends it in exactly one slash', () => {
    expect(siteUrl('https://hooplog.example/')).toBe('https://hooplog.example/');
    expect(siteUrl('https://hooplog.example')).toBe('https://hooplog.example/');
    expect(siteUrl(' https://example.com/app ')).toBe('https://example.com/app/');
  });

  it.each([
    ['plain http', 'http://hooplog.example/'],
    ['another kind of address', 'javascript:alert(1)'],
    ['something that is not an address', 'hooplog'],
    ['a query', 'https://hooplog.example/?x=1'],
    ['a fragment', 'https://hooplog.example/#top'],
  ])('ignores %s and uses the default', (_why, configured) => {
    expect(siteUrl(configured)).toBe(DEFAULT_SITE_URL);
  });
});

describe('confirmationUrl', () => {
  it('points at the confirm page of the site', () => {
    expect(confirmationUrl()).toBe('https://datnguyenpt.github.io/hooplog/confirm/');
    expect(confirmationUrl('https://hooplog.example')).toBe('https://hooplog.example/confirm/');
  });

  it('is a page that exists in the site folder, so renaming one cannot break the other', () => {
    const page = confirmationUrl().slice(DEFAULT_SITE_URL.length);
    expect(page).not.toBe('');
    expect(existsSync(join(__dirname, '..', '..', '..', '..', 'site', page, 'index.html'))).toBe(
      true,
    );
  });
});
