import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEnglishOnlyWhisper, whisperModelFor, MULTILINGUAL_WHISPER } from '../../src/shared/settings.js';

test('English-only Whisper models are recognized', () => {
  for (const m of ['distil-large-v3', 'distil-whisper/distil-large-v3', 'small.en', 'medium.en']) assert.equal(isEnglishOnlyWhisper(m), true, m);
  for (const m of ['large-v3-turbo', 'large-v3', 'medium', 'tiny', '']) assert.equal(isEnglishOnlyWhisper(m), false, m);
});

test('speech that is not English never goes to an English-only model', () => {
  // distil-large-v3 writes Turkish speech as an English rendering ("How old are you?").
  assert.equal(whisperModelFor('distil-large-v3', 'tr'), MULTILINGUAL_WHISPER);
  assert.equal(whisperModelFor('distil-large-v3', ''), MULTILINGUAL_WHISPER, 'unknown language: could be anything');
  assert.equal(whisperModelFor('distil-large-v3', 'en'), 'distil-large-v3');
  assert.equal(whisperModelFor('distil-large-v3', 'en-US'), 'distil-large-v3');
  assert.equal(whisperModelFor('large-v3', 'tr'), 'large-v3');
  assert.equal(whisperModelFor('', 'tr'), '');
});
