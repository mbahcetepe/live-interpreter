import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The Chrome Web Store refuses a package whose name is over 75 characters or whose
// description is over 132.
test('every locale fits the Chrome Web Store limits', () => {
  const dir = new URL('../../src/_locales/', import.meta.url);
  const langs = readdirSync(dir);
  assert.ok(langs.length >= 5);
  for (const lang of langs) {
    const messages = JSON.parse(readFileSync(new URL(`${lang}/messages.json`, dir), 'utf8'));
    assert.ok(messages.extName.message.length <= 75, `${lang} name`);
    assert.ok(messages.extDescription.message.length <= 132, `${lang} description is ${messages.extDescription.message.length} characters`);
  }
});
