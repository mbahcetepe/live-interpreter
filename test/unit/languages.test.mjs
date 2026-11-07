import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserMessage } from '../../src/offscreen/translator.js';
import { deeplCodes, FreeTranslator } from '../../src/offscreen/free-translator.js';
import { firstRunDefaults, DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import { AUTO_LANGUAGE, languageByCode } from '../../src/shared/languages.js';

test('an unknown source language is left to the translator to recognize', () => {
  const system = buildSystemPrompt({ from: AUTO_LANGUAGE, to: 'de', myLanguage: 'de', theirLanguage: 'en' });
  assert.match(system, /Translate the utterance into German\. It can be in any language/);
  assert.doesNotMatch(system, /from Detect/);
  const user = buildUserMessage({ text: 'Hola a todos.', from: AUTO_LANGUAGE, to: 'de', history: [] });
  assert.match(user, /Utterance to interpret, into German:/);
});

test('a video tab is described as something watched, not a call, and leaves the meeting notes out', () => {
  const media = buildSystemPrompt({ from: 'en', to: 'ja', myLanguage: 'ja', theirLanguage: 'ko', meetingContext: 'Budget review', media: true });
  assert.match(media, /watching or listening to a video/);
  assert.doesNotMatch(media, /counterpart speaks Korean/);
  assert.doesNotMatch(media, /Budget review/);
  const call = buildSystemPrompt({ from: 'en', to: 'ja', myLanguage: 'ja', theirLanguage: 'en', meetingContext: 'Budget review' });
  assert.match(call, /live video call/);
  assert.match(call, /Budget review/);
});

test('DeepL finds the source language itself when it is not known', () => {
  assert.deepEqual(deeplCodes(AUTO_LANGUAGE, 'en'), { target_lang: 'EN-US' });
  assert.deepEqual(deeplCodes('fr', 'de'), { source_lang: 'FR', target_lang: 'DE' });
});

test("Chrome's translator gets the language Chrome's detector found", async () => {
  const asked = [];
  const local = {
    availability: async () => 'available',
    create: async ({ sourceLanguage, targetLanguage }) => {
      asked.push(`${sourceLanguage}>${targetLanguage}`);
      return { translate: async (text) => `[${sourceLanguage}] ${text}` };
    },
  };
  const detector = { create: async () => ({ detect: async (text) => [{ detectedLanguage: text.startsWith('Bonjour') ? 'fr' : 'de', confidence: 0.9 }] }) };
  const tr = new FreeTranslator({ local, detector, myLanguage: 'en', theirLanguage: 'fr' });
  const out = [];
  for await (const piece of tr.translate({ text: 'Bonjour à tous.', from: AUTO_LANGUAGE, to: 'en', history: [] })) out.push(piece);
  assert.deepEqual(asked, ['fr>en']);
  assert.match(out.join(' '), /^\[fr\]/i); // the first letter follows the source sentence's case
  // Without a detector that step cannot help with an unknown language.
  const blind = new FreeTranslator({ local, detector: null });
  assert.equal(blind.usable({ id: 'chrome', kind: 'local' }, AUTO_LANGUAGE, 'en'), false);
});

test('the first start takes my language from the browser; the interface stays English', () => {
  assert.deepEqual(firstRunDefaults('de-DE'), { myLanguage: 'de', theirLanguage: 'en' });
  assert.deepEqual(firstRunDefaults('tr-TR'), { myLanguage: 'tr', theirLanguage: 'en' });
  assert.deepEqual(firstRunDefaults('en-US'), { myLanguage: 'en', theirLanguage: 'es' });
  assert.deepEqual(firstRunDefaults('xx'), { myLanguage: 'en', theirLanguage: 'es' });
  assert.equal(DEFAULT_SETTINGS.uiLanguage, 'en');
  assert.equal(DEFAULT_SETTINGS.mediaLanguage, AUTO_LANGUAGE);
  assert.equal(languageByCode(AUTO_LANGUAGE).english, 'Detect automatically');
});