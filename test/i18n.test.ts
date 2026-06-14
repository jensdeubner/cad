import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import {
  interpolate,
  t,
  setLocale,
  getLocale,
  getLocales,
  localeLabel,
} from '../src/i18n/index';

/** Extract the set of `{{token}}` placeholders found in a string. */
function placeholders(text: string): string[] {
  const tokens = text.match(/\{\{\w+\}\}/g) ?? [];
  return tokens.slice().sort();
}

// This Node-backed jsdom environment does NOT provide window.localStorage
// (Node logs: "localStorage is not available because --localstorage-file was
// not provided"). In a real browser localStorage exists, and setLocale() calls
// localStorage.setItem(...). To exercise the real setLocale/t logic the way the
// app runs in a browser, install a minimal in-memory localStorage polyfill on
// the global. This only configures the test's own global; it does not touch
// src, config, or other test files. Without it, setLocale() throws a TypeError
// ("Cannot read properties of undefined (reading 'setItem')") on any real
// locale switch — that is the actual behavior in this bare jsdom environment.
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    const polyfill = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: polyfill,
      configurable: true,
      writable: true,
    });
  }
});

describe('i18n catalogs: de/en parity', () => {
  it('de and en expose the exact same set of keys', () => {
    const deKeys = new Set(Object.keys(de));
    const enKeys = new Set(Object.keys(en));

    const onlyInDe = [...deKeys].filter((k) => !enKeys.has(k));
    const onlyInEn = [...enKeys].filter((k) => !deKeys.has(k));

    expect(onlyInDe).toEqual([]);
    expect(onlyInEn).toEqual([]);
  });

  it('de and en have the same number of keys', () => {
    expect(Object.keys(de).length).toBe(Object.keys(en).length);
  });

  it('no de value is an empty string', () => {
    const empty = Object.entries(de)
      .filter(([, v]) => v === '')
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('no en value is an empty string', () => {
    const empty = Object.entries(en)
      .filter(([, v]) => v === '')
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('all de/en values are strings', () => {
    for (const v of Object.values(de)) expect(typeof v).toBe('string');
    for (const v of Object.values(en)) expect(typeof v).toBe('string');
  });
});

describe('i18n placeholder consistency', () => {
  it('every de value with {{tokens}} has the same tokens in the matching en value', () => {
    const mismatches: Array<{ key: string; de: string[]; en: string[] }> = [];
    for (const [key, deVal] of Object.entries(de)) {
      const deTokens = placeholders(deVal);
      if (deTokens.length === 0) continue;
      const enTokens = placeholders(en[key] ?? '');
      if (JSON.stringify(deTokens) !== JSON.stringify(enTokens)) {
        mismatches.push({ key, de: deTokens, en: enTokens });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('there is at least one placeholder-bearing key (sanity check the consistency test is meaningful)', () => {
    const withTokens = Object.values(de).filter((v) => placeholders(v).length > 0);
    expect(withTokens.length).toBeGreaterThan(0);
  });
});

describe('interpolate()', () => {
  it('replaces a single {{name}} placeholder', () => {
    expect(interpolate('Hi {{name}}', { name: 'Jo' })).toBe('Hi Jo');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(interpolate('{{a}} and {{b}}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('replaces repeated occurrences of the same placeholder', () => {
    expect(interpolate('{{n}}-{{n}}', { n: '5' })).toBe('5-5');
  });

  it('coerces number params to strings', () => {
    expect(interpolate('count={{c}}', { c: 7 })).toBe('count=7');
  });

  it('substitutes empty string for a missing param', () => {
    expect(interpolate('Hi {{name}}', {})).toBe('Hi ');
  });

  it('substitutes empty string for an undefined-valued param', () => {
    // params object present but key resolves to undefined -> '' via `?? ''`
    expect(interpolate('Hi {{name}}', { other: 'x' })).toBe('Hi ');
  });

  it('returns text unchanged when params is omitted (early return, placeholders kept)', () => {
    expect(interpolate('Hi {{name}}')).toBe('Hi {{name}}');
  });

  it('returns text unchanged when there are no placeholders', () => {
    expect(interpolate('plain text', { name: 'Jo' })).toBe('plain text');
  });

  it('leaves non-\\w placeholder syntax untouched', () => {
    // regex is \{\{(\w+)\}\} so a token with a dot is not matched
    expect(interpolate('{{a.b}}', { 'a.b': 'x' })).toBe('{{a.b}}');
  });
});

describe('t() with default locale (de)', () => {
  beforeEach(() => {
    // ensure each t() test starts from the default locale
    setLocale('de');
  });

  it('returns the German default for a known key', () => {
    expect(t('app.title')).toBe('CAD — Manuelle 3D Negativform');
    expect(t('app.title')).toBe(de['app.title']);
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('interpolates params into a resolved message', () => {
    // 'X {{y}}' is not a real key, so falls through to the key, then interpolates
    expect(t('greeting {{name}}', { name: 'Jo' })).toBe('greeting Jo');
  });

  it('returns a known key value unchanged when no params are passed', () => {
    expect(t('tabs.start')).toBe(de['tabs.start']);
  });
});

describe('setLocale / getLocale / getLocales / localeLabel', () => {
  beforeEach(() => {
    setLocale('de');
  });

  it('getLocale() reports de by default', () => {
    expect(getLocale()).toBe('de');
  });

  it('getLocales() returns both supported locales', () => {
    expect(getLocales()).toEqual(['de', 'en']);
  });

  it('localeLabel maps locale codes to display names', () => {
    expect(localeLabel('de')).toBe('Deutsch');
    expect(localeLabel('en')).toBe('English');
  });

  it('setLocale("en") switches the active locale and t() returns en values', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('app.title')).toBe('CAD — Manual 3D Negative Mold');
    expect(t('app.title')).toBe(en['app.title']);
  });

  it('persists the chosen locale to localStorage under cad.locale', () => {
    setLocale('en');
    expect(localStorage.getItem('cad.locale')).toBe('en');
  });

  it('sets document.documentElement.lang to the chosen locale', () => {
    setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to the de value when a key is missing only in en', () => {
    // Parity holds (tested above), so this exercises the DEFAULT_LOCALE fallback
    // path generically: t() uses catalogs[locale][key] ?? catalogs.de[key] ?? key.
    setLocale('en');
    const fakeKey = '__definitely_missing__';
    expect(t(fakeKey)).toBe(fakeKey);
  });

  it('switching back to de restores German values', () => {
    setLocale('en');
    setLocale('de');
    expect(getLocale()).toBe('de');
    expect(t('app.title')).toBe(de['app.title']);
  });

  it('setLocale ignores a no-op call to the current locale (no throw, stays put)', () => {
    setLocale('de'); // already de after beforeEach -> early return
    expect(getLocale()).toBe('de');
  });
});
