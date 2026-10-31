import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/** Add a locale (for example `vi`) by adding a JSON file here; no screen code changes. */
const resources = { en: { translation: en } };

const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';

const i18next = createInstance();

void i18next.use(initReactI18next).init({
  resources,
  lng: deviceLanguage in resources ? deviceLanguage : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
