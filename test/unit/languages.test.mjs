import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserMessage } from '../../src/offscreen/translator.js';
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

test('the first start takes my language from the browser; the interface stays English', () => {
  assert.deepEqual(firstRunDefaults('de-DE'), { myLanguage: 'de', theirLanguage: 'en' });
  assert.deepEqual(firstRunDefaults('tr-TR'), { myLanguage: 'tr', theirLanguage: 'en' });
  assert.deepEqual(firstRunDefaults('en-US'), { myLanguage: 'en', theirLanguage: 'es' });
  assert.deepEqual(firstRunDefaults('xx'), { myLanguage: 'en', theirLanguage: 'es' });
  assert.equal(DEFAULT_SETTINGS.uiLanguage, 'en');
  assert.equal(DEFAULT_SETTINGS.mediaLanguage, AUTO_LANGUAGE);
  assert.equal(languageByCode(AUTO_LANGUAGE).english, 'Detect automatically');
});