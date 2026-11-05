import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePageState } from '../../src/shared/page-state.js';
import { isAllowed, senderKind, cleanModes } from '../../src/background/message-policy.js';

const ID = 'abcdefghijklmnop';
const OFFSCREEN = `chrome-extension://${ID}/offscreen.html`;
const policy = (sessionTabId = 7) => ({ extensionId: ID, offscreenUrl: OFFSCREEN, sessionTabId });
const popup = { id: ID, url: `chrome-extension://${ID}/popup.html` };
const engine = { id: ID, url: OFFSCREEN };
const tab = (id) => ({ id: ID, url: 'https://teams.microsoft.com/', tab: { id } });

test('page state keeps only known fields of the right type', () => {
  const s = sanitizePageState({ muted: false, senders: 1, inCall: true, micLabel: 'Mic', backlog: 1.5, evil: 'x', debug: { dom: false, extra: 1 } });
  assert.equal(s.muted, false);
  assert.equal(s.senders, 1);
  assert.equal(s.micLabel, 'Mic');
  assert.equal(s.debug.dom, false);
  assert.equal('evil' in s, false);
  assert.equal('extra' in s.debug, false);
});

test('a page state that is unclear counts as muted', () => {
  for (const bad of [null, 'x', {}, { muted: 'no' }, { muted: 0 }]) assert.equal(sanitizePageState(bad).muted, true);
  const s = sanitizePageState({ muted: false, senders: -3, backlog: Infinity, micLabel: { toString: () => 'x' }, debug: { dom: 'yes' } });
  assert.equal(s.senders, 0);
  assert.equal(s.backlog, 0);
  assert.equal(s.micLabel, '');
  assert.equal(s.debug.dom, null);
  assert.equal(sanitizePageState({ micLabel: 'a'.repeat(5000) }).micLabel.length, 200);
});

test('senders are told apart', () => {
  assert.equal(senderKind(popup, policy()), 'extension');
  assert.equal(senderKind(engine, policy()), 'engine');
  assert.equal(senderKind(tab(7), policy()), 'tab');
  assert.equal(senderKind({ id: 'other', url: OFFSCREEN }, policy()), 'foreign');
  assert.equal(senderKind(undefined, policy()), 'foreign');
  // The settings page opened in a tab is still the extension's own page.
  assert.equal(senderKind({ id: ID, url: `chrome-extension://${ID}/options.html`, tab: { id: 3 } }, policy()), 'extension');
  // A content script on a look-alike address is not.
  assert.equal(senderKind({ id: ID, url: `https://chrome-extension.${ID}.evil.com/`, tab: { id: 3 } }, policy()), 'tab');
});

test('a call page tab may only say hello and stop its own session', () => {
  assert.equal(isAllowed('tab-hello', tab(7), policy()), true);
  assert.equal(isAllowed('stop', tab(7), policy()), true);
  assert.equal(isAllowed('stop', tab(8), policy()), false);
  assert.equal(isAllowed('stop', tab(7), policy(null)), false);
  for (const type of ['start', 'options', 'chime', 'engine-options', 'engine-failed', 'call-ended', 'recording-ready', 'engine-status', 'unknown']) {
    assert.equal(isAllowed(type, tab(7), policy()), false, type);
  }
});

test('the popup starts and changes sessions, the engine reports on them', () => {
  for (const type of ['start', 'stop', 'options', 'chime']) assert.equal(isAllowed(type, popup, policy()), true, type);
  for (const type of ['engine-options', 'engine-failed', 'call-ended']) {
    assert.equal(isAllowed(type, engine, policy()), true, type);
    assert.equal(isAllowed(type, popup, policy()), false, type);
  }
  assert.equal(isAllowed('start', { id: 'other' }, policy()), false);
});

test('only the two modes with known values are kept', () => {
  assert.deepEqual(cleanModes({ incomingMode: 'text', outgoingMode: 'off', anthropicKey: 'x' }), { incomingMode: 'text', outgoingMode: 'off' });
  assert.deepEqual(cleanModes({ incomingMode: 'loud', outgoingMode: 'text' }), {});
  assert.deepEqual(cleanModes(null), {});
});
