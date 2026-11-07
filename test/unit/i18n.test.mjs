import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS_FOR_TESTS as STRINGS, UI_LANGUAGES, setLanguage, getLanguage, t, languageLabel, joinNames, locale } from '../../src/shared/i18n.js';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';

test('the interface starts in English', () => {
  assert.equal(DEFAULT_SETTINGS.uiLanguage, 'en');
  assert.equal(getLanguage(), 'en');
});

test('every interface language has exactly the keys of English', () => {
  assert.deepEqual(UI_LANGUAGES.map((l) => l.code), ['en', 'tr', 'de', 'es', 'zh']);
  const en = Object.keys(STRINGS.en).sort();
  for (const { code } of UI_LANGUAGES) {
    const keys = Object.keys(STRINGS[code]).sort();
    assert.deepEqual(keys.filter((k) => !(k in STRINGS.en)), [], `${code} has extra keys`);
    assert.deepEqual(en.filter((k) => !(k in STRINGS[code])), [], `${code} is missing keys`);
  }
});

test('placeholders match between the languages', () => {
  const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const { code } of UI_LANGUAGES) {
    for (const key of Object.keys(STRINGS.en)) assert.equal(names(STRINGS[code][key]), names(STRINGS.en[key]), `${code} ${key}`);
  }
});

test('the other interface languages name the call languages in their own words', () => {
  for (const [code, word] of [['de', 'Englisch'], ['es', 'Inglés'], ['zh', '英语']]) {
    setLanguage(code);
    assert.equal(languageLabel('en'), word);
  }
  setLanguage('en');
});

test('no em dashes in any interface text', () => {
  for (const lang of Object.keys(STRINGS)) {
    for (const [key, text] of Object.entries(STRINGS[lang])) assert.doesNotMatch(text, /—/, `${lang} ${key}`);
  }
});

test('switching languages changes texts, names and number formats', () => {
  setLanguage('tr');
  assert.equal(t('popup.start'), 'Çeviriyi başlat');
  assert.equal(languageLabel('en'), 'İngilizce');
  assert.equal(joinNames(['ElevenLabs', 'Anthropic']), 'ElevenLabs ve Anthropic');
  assert.equal(locale(), 'tr-TR');
  setLanguage('en');
  assert.equal(t('popup.start'), 'Start translation');
  assert.equal(languageLabel('tr'), 'Turkish');
  assert.equal(t('err.keysMissing', { names: joinNames(['ElevenLabs', 'Anthropic']) }), 'ElevenLabs and Anthropic API key missing. Add it in the extension settings.');
  assert.equal(setLanguage('xx'), 'en');
});

test('an unknown key falls back to the key itself', () => {
  assert.equal(t('does.not.exist'), 'does.not.exist');
});
