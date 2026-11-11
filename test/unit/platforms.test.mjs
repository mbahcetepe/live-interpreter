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

import { zoomMuted, OPTIONAL_PLATFORMS } from '../../src/shared/platforms.js';

test('Zoom: the web client, on Zoom own and company addresses, and nothing else', () => {
  assert.equal(platformForUrl('https://app.zoom.us/wc/71219263145/start?from=pwa').id, 'zoom');
  assert.equal(platformForUrl('https://acme.zoom.us/wc/join/123').id, 'zoom');
  for (const url of ['https://zoom.us.evil.example/wc/1', 'https://evilzoom.us/wc/1', 'http://app.zoom.us/wc/1', 'https://app.zoom.us/j/123']) {
    assert.equal(isSupportedUrl(url), false, url);
  }
});

test('Zoom is asked for when first used: not in the manifest, and its script patterns are its own', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../src/manifest.json', import.meta.url)));
  const zoom = OPTIONAL_PLATFORMS.find((p) => p.id === 'zoom');
  assert.ok(zoom && zoom.audioPath === 'microphone');
  assert.ok(!manifest.host_permissions.some((p) => p.includes('zoom')));
  // The optional host access in the manifest covers what is asked for.
  assert.ok(manifest.optional_host_permissions.includes('https://*/*'));
  assert.deepEqual(zoom.scriptMatches, ['https://*.zoom.us/wc/*']);
});

test('Zoom: the audio button label says what a click would do', () => {
  assert.equal(zoomMuted([{ label: 'unmute my microphone', tag: 'join-audio-container__btn' }]), true);
  assert.equal(zoomMuted([{ label: 'mute my microphone', tag: 'join-audio-container__btn' }]), false);
  assert.equal(zoomMuted([{ label: 'Join Audio', tag: 'join-audio-container__btn' }]), true);
  assert.equal(zoomMuted([{ label: 'Mute All', tag: 'participants' }]), null);
  assert.equal(zoomMuted([{ label: 'Start Video', tag: 'send-video-container__btn' }]), null);
  assert.equal(zoomMuted([]), null);
});
