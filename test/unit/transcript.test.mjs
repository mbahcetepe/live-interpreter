import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptLog, transcriptToText, transcriptToSrt } from '../../src/shared/transcript.js';

const START = 1_700_000_000_000;

function sampleLog(kind = 'call') {
  const log = new TranscriptLog({ id: 't-1', startedAt: START, title: 'Weekly call', url: 'https://teams.microsoft.com/x', kind, myLanguage: 'tr', theirLanguage: 'en' });
  log.add('in', { id: 'a', phase: 'committed', source: 'Hello everyone' }, START + 3_000);
  log.add('in', { id: 'a', phase: 'translating', translation: 'Herkese mer' }, START + 3_200);
  log.add('in', { id: 'a', phase: 'translated', translation: 'Herkese merhaba' }, START + 3_500);
  log.add('out', { id: 'b', phase: 'committed', source: 'Merhaba' }, START + 65_250);
  log.add('out', { id: 'b', phase: 'translated', translation: 'Hello' }, START + 65_600);
  return log;
}

const labels = { title: 'Transcript', date: 'Date', them: 'Them', me: 'Me', speaker: 'Speaker', formatDate: () => 'D' };

test('a transcript keeps each sentence once, with its latest translation', () => {
  const log = sampleLog();
  assert.equal(log.add('in', { id: 'a', phase: 'committed', source: 'Hello everyone' }), false);
  assert.equal(log.add('in', { id: 'zz', phase: 'translated', translation: 'x' }), false);
  assert.equal(log.add('in', { id: 'c', phase: 'partial', source: 'Draf' }), false);
  const snap = log.snapshot({ endedAt: START + 70_000 });
  assert.equal(snap.endedAt, START + 70_000);
  assert.equal(snap.kind, 'call');
  assert.deepEqual(snap.lines, [
    { at: 3_000, dir: 'in', source: 'Hello everyone', translation: 'Herkese merhaba' },
    { at: 65_250, dir: 'out', source: 'Merhaba', translation: 'Hello' },
  ]);
});

test('the text file names who spoke and when', () => {
  const text = transcriptToText(sampleLog().snapshot(), labels);
  assert.match(text, /^Transcript: Weekly call\nDate: D\nhttps:\/\/teams\.microsoft\.com\/x\n\n/);
  assert.match(text, /\[00:00:03\] Them: Hello everyone\n {4}→ Herkese merhaba/);
  assert.match(text, /\[00:01:05\] Me: Merhaba\n {4}→ Hello/);
  const media = transcriptToText(sampleLog('media').snapshot(), labels);
  assert.match(media, /\[00:00:03\] Speaker: Hello everyone/);
  assert.doesNotMatch(media, /Them:|Me:/);
});

test('subtitles show the translation over the original, timed from the start', () => {
  const srt = transcriptToSrt(sampleLog().snapshot());
  const blocks = srt.trim().split('\n\n');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], '1\n00:00:03,000 --> 00:00:05,000\nHerkese merhaba\nHello everyone');
  assert.match(blocks[1], /^2\n00:01:05,250 --> 00:01:07,250\nHello\nMerhaba$/);
});

test('a subtitle ends when the next one begins', () => {
  const log = new TranscriptLog({ id: 't', startedAt: 0, kind: 'media' });
  log.add('in', { id: 'a', phase: 'committed', source: 'A long sentence that would stay on screen for several seconds' }, 1_000);
  log.add('in', { id: 'b', phase: 'committed', source: 'Next' }, 2_500);
  const srt = transcriptToSrt(log.snapshot());
  assert.match(srt, /00:00:01,000 --> 00:00:02,500/);
});
