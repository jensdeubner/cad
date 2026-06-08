export type Locale = 'de' | 'en';

export type Messages = Record<string, string>;

export const LOCALES: Locale[] = ['de', 'en'];

export const DEFAULT_LOCALE: Locale = 'de';

export const LOCALE_STORAGE_KEY = 'cad.locale';