import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { platformForUrl, isSupportedUrl, URL_PATTERNS, meetMuted, teamsMuted } from '../../src/shared/platforms.js';

test('addresses map to the right platform', () => {
  assert.equal(platformForUrl('https://meet.google.com/abc-defg-hij').id, 'meet');
  assert.equal(platformForUrl('https://teams.microsoft.com/v2/').id, 'teams');
  assert.equal(platformForUrl('https://teams.cloud.microsoft/').id, 'teams');
  assert.equal(platformForUrl('https://teams.live.com/meet/9312345').id, 'teams');
});

test('look-alike and unrelated addresses are refused', () => {
  for (const url of [
    'https://meet.google.com.evil.example/',
    'https://teams.microsoft.com.evil.example/',
    'http://teams.microsoft.com/',
    'https://www.google.com/',
    'chrome://extensions/',
    undefined,
    null,
  ]) {
    assert.equal(isSupportedUrl(url), false, String(url));
  }
});

test('the manifest covers every supported site, for both content scripts and host access', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../src/manifest.json', import.meta.url)));
  for (const pattern of URL_PATTERNS) {
    assert.ok(manifest.host_permissions.includes(pattern), pattern);
    for (const script of manifest.content_scripts) assert.ok(script.matches.includes(pattern), `${script.js} ${pattern}`);
  }
});

test('Meet: the shortcut in the tooltip picks the microphone over the camera', () => {
  const buttons = [
    { label: 'Turn off camera (ctrl + e)', isMuted: 'false' },
    { label: 'Turn on microphone (ctrl + d)', isMuted: 'true' },
  ];
  assert.equal(meetMuted(buttons), true);
  assert.equal(meetMuted([{ label: 'Mikrofonu kapat', isMuted: 'false' }]), false);
  assert.equal(meetMuted([]), null);
});

test('Teams: the label says what a click would do', () => {
  assert.equal(teamsMuted([{ label: 'Unmute mic (Ctrl+Shift+M)', tag: 'microphone-button' }]), true);
  assert.equal(teamsMuted([{ label: 'Mute mic (Ctrl+Shift+M)', tag: '' }]), false);
  assert.equal(teamsMuted([{ label: 'Unmute (⌘+Shift+M)', tag: '' }]), true);
  assert.equal(teamsMuted([{ label: 'Mikrofonun sesini aç (Ctrl+Shift+M)', tag: '' }]), true);
  assert.equal(teamsMuted([{ label: 'Mikrofonun sesini kapat (Ctrl+Shift+M)', tag: '' }]), false);
});

test('Teams: buttons that are not the microphone, or labels it cannot read, give no answer', () => {
  assert.equal(teamsMuted([{ label: 'Turn camera off (Ctrl+Shift+O)', tag: 'video-button' }]), null);
  assert.equal(teamsMuted([{ label: 'Mute all participants', tag: 'roster' }]), null);
  assert.equal(teamsMuted([{ label: 'Mikrofon (Ctrl+Shift+M)', tag: '' }]), null);
  assert.equal(teamsMuted([]), null);
});
