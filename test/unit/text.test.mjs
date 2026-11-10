import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SentenceSplitter, EchoGuard, lcsLength, words, isOnlyPunctuation } from '../../src/shared/text.js';

test('streamed text is cut at sentence ends', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('Hello there, my friend. How are'), ['Hello there, my friend.']);
  assert.deepEqual(s.push(' you doing today? Fine'), ['How are you doing today?']);
  assert.equal(s.flush(), 'Fine');
});

test('very short sentences are kept together with the next one', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('Ok. Then we go there. Next'), ['Ok. Then we go there.']);
});

test('decimals and a sentence end without a following space are not cut', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('It costs 3.5 million dollars.'), []);
  assert.equal(s.flush(), 'It costs 3.5 million dollars.');
});

test('a long sentence is cut at a comma', () => {
  const s = new SentenceSplitter({ softMax: 60 });
  const pieces = s.push('We looked at the numbers for the last quarter, and the growth was strong in every region we');
  assert.equal(pieces.length, 1);
  assert.ok(pieces[0].endsWith(','));
});

test('Turkish text is split the same way', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('Cuma günü saat üçte buluşalım mı? Bence uygun'), ['Cuma günü saat üçte buluşalım mı?']);
});

test('word helpers', () => {
  assert.deepEqual(words('Çok güzel, değil mi?'), ['cok', 'guzel', 'degil', 'mi']);
  assert.equal(lcsLength(['a', 'b', 'c', 'd'], ['b', 'x', 'c', 'd']), 3);
  assert.ok(isOnlyPunctuation(' ... '));
  assert.ok(!isOnlyPunctuation('Tamam.'));
});

test('our own voice coming back right away is an echo', () => {
  const guard = new EchoGuard();
  guard.remember('Can we meet on Friday at three?', { start: 1000, end: 3000 });
  assert.equal(guard.isEcho('can we meet on Friday at three', 4000), true);
});

test('a later reply that reuses the same words is not an echo', () => {
  const guard = new EchoGuard();
  guard.remember('Can we meet on Friday at three?', { start: 1000, end: 3000 });
  assert.equal(guard.isEcho('Yes, we can meet on Friday at three.', 9000), false);
});

test('a quick but different reply is not an echo', () => {
  const guard = new EchoGuard();
  guard.remember('Can we meet on Friday at three?', { start: 1000, end: 3000 });
  assert.equal(guard.isEcho('Yes Friday at three works for me', 3500), false);
});

test('short utterances are never treated as echoes', () => {
  const guard = new EchoGuard();
  guard.remember('Thank you', { start: 1000, end: 2000 });
  assert.equal(guard.isEcho('Thank you', 2500), false);
});

import { EarlySentences, finishedSentenceEnd, remainderAfter } from '../../src/shared/text.js';

// Partial transcripts as Scribe v2 Realtime sent them for test/e2e/fixtures/english.wav.
const PARTIALS = [
  'Hi.',
  'Hi. Thank-',
  'Hi. Thanks for joining the call today.',
  'Hi. Thanks for joining the call today. I wanted to talk',
  'Hi. Thanks for joining the call today. I wanted to talk about the launch',
  'Hi. Thanks for joining the call today. I wanted to talk about the launch timeline. We are planning to open the',
  'Hi. Thanks for joining the call today. I wanted to talk about the launch timeline. We are planning to open the public sale',
  'Hi. Thanks for joining the call today. I wanted to talk about the launch timeline. We are planning to open the public sale next Friday at 3:00 in the afternoon.',
  'Hi. Thanks for joining the call today. I wanted to talk about the launch timeline. We are planning to open the public sale next Friday at 3:00 in the afternoon. Does that',
  'Hi. Thanks for joining the call today. I wanted to talk about the launch timeline. We are planning to open the public sale next Friday at 3:00 in the afternoon. Does that work for your team?',
];
const FINAL = 'Hi. Thanks for joining the call today. I wanted to talk about the launch timeline. We are planning to open the public sale next Friday at 3:00 in the afternoon. Does that work for your team?';

test('finished sentences are sent while the speaker keeps talking, each once', () => {
  const early = new EarlySentences();
  const sent = PARTIALS.map((p) => early.partial(p)).filter(Boolean);
  assert.deepEqual(sent, [
    'Hi. Thanks for joining the call today.',
    'I wanted to talk about the launch timeline.',
    'We are planning to open the public sale next Friday at 3:00 in the afternoon.',
  ]);
  assert.equal(early.committed(FINAL), 'Does that work for your team?');
});

test('a sentence is only sent once more words follow it and it has stayed the same', () => {
  const early = new EarlySentences();
  assert.equal(early.partial('We should meet on Friday.'), '');
  assert.equal(early.partial('We should meet on Friday. And'), '');
  assert.equal(early.partial('We should meet on Friday. And then'), 'We should meet on Friday.');
});

test('a segment with nothing sent ahead is committed whole', () => {
  const early = new EarlySentences();
  early.partial('Yes.');
  assert.equal(early.committed('Yes, that works.'), 'Yes, that works.');
});

test('the live line shows only what has not been sent', () => {
  const early = new EarlySentences();
  early.partial('First point is clear. Second');
  early.partial('First point is clear. Second one');
  assert.equal(early.live('First point is clear. Second one is'), 'Second one is');
});

test('abbreviations, initials and decimals do not end a sentence', () => {
  assert.equal(finishedSentenceEnd('Hello Mr. Smith, how are you'), 0);
  assert.equal(finishedSentenceEnd('Ask J. Doe about it'), 0);
  assert.equal(finishedSentenceEnd('It costs 3.5 million. Then'), 'It costs 3.5 million.'.length);
});

test('small changes in the final transcript are tolerated', () => {
  assert.equal(remainderAfter('Hi. Thanks for joining the call today.', 'Hi, thanks for joining the call today! I wanted to talk.'), 'I wanted to talk.');
  assert.equal(remainderAfter('Merhaba. Davet için teşekkürler.', 'Merhaba, davet için teşekkürler. Cuma günü uygun.'), 'Cuma günü uygun.');
  assert.equal(remainderAfter('Completely different words here.', 'Nothing alike at all.'), 'Nothing alike at all.');
});

test('a final transcript that only revises what was sent ahead adds nothing', () => {
  const early = new EarlySentences();
  early.partial('Cuma günü saat üç bizim için uygundur. Ekibimle');
  assert.equal(early.partial('Cuma günü saat üç bizim için uygundur. Ekibimle'), 'Cuma günü saat üç bizim için uygundur.');
  assert.equal(early.committed('Cuma günü saat üç bizim için uygun. Ekibimle konuşacağım.'), 'Ekibimle konuşacağım.');
  const same = new EarlySentences();
  same.partial('Bu çok kolay. Tekrar');
  same.partial('Bu çok kolay. Tekrar');
  assert.equal(same.committed('Bu çok kolay'), '');
});

test('a clause long enough to speak is cut at its comma, before the sentence ends', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('Bugün görüşmeye katıldığınız için, hepinize çok teşekkür'), ['Bugün görüşmeye katıldığınız için,']);
  assert.deepEqual(s.push(' ederim. Sonra'), ['hepinize çok teşekkür ederim.']);
  assert.equal(s.flush(), 'Sonra');
});

test('a short clause stays with the rest of its sentence', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('Yes, I agree with that. And'), ['Yes, I agree with that.']);
});

test('text with no break at all is cut at a space once it runs long', () => {
  const s = new SentenceSplitter();
  const long = 'word '.repeat(30);
  const pieces = s.push(long);
  assert.equal(pieces.length, 1);
  assert.ok(pieces[0].length <= 110 && !pieces[0].endsWith(' '));
});

// ---- Chinese and Japanese: no spaces, full-width punctuation -----------------------------

import { textWeight } from '../../src/shared/text.js';

const streamAll = (splitter, chunks) => [...chunks.flatMap((c) => splitter.push(c)), splitter.flush()].filter(Boolean);

test('a Chinese translation is spoken clause by clause, though it has no spaces', () => {
  const pieces = streamAll(new SentenceSplitter(), ['我们今天讨论一下', '新产品的发布计划，', '然后再看预算。', '大家', '有问题吗？']);
  assert.deepEqual(pieces, ['我们今天讨论一下新产品的发布计划，', '然后再看预算。', '大家有问题吗？']);
});

test('a Chinese sentence end waits for the next character, so a closing quote stays with it', () => {
  const splitter = new SentenceSplitter();
  assert.deepEqual(splitter.push('他说：「明天我们一起开会讨论这个问题。'), []);
  assert.deepEqual(splitter.push('」然后'), ['他说：「明天我们一起开会讨论这个问题。」']);
});

test('Japanese is cut at 、 and 。 the same way', () => {
  const pieces = streamAll(new SentenceSplitter(), ['来週の金曜日までに報告書を送っていただけますか、', 'よろしくお願いします。']);
  assert.deepEqual(pieces, ['来週の金曜日までに報告書を送っていただけますか、', 'よろしくお願いします。']);
});

test('long Chinese text with no punctuation is cut between characters', () => {
  const splitter = new SentenceSplitter();
  const pieces = splitter.push('这'.repeat(80));
  assert.equal(pieces.length, 1);
  assert.ok(textWeight(pieces[0]) <= 110 && textWeight(pieces[0]) >= 100, `weight ${textWeight(pieces[0])}`);
});

test('a Chinese or Japanese character weighs two Latin ones; Latin text is unchanged', () => {
  assert.equal(textWeight('你好'), 4);
  assert.equal(textWeight('ok'), 2);
  assert.equal(textWeight('API接口'), 7);
  // Latin rules as before: no cut at a decimal comma or a full stop without a space.
  assert.deepEqual(new SentenceSplitter().push('The price went up to 3,5 percent.'), []);
});

test('Chinese and Japanese words are single characters', () => {
  assert.deepEqual(words('你好世界'), ['你', '好', '世', '界']);
  assert.deepEqual(words('api接口 works'), ['api', '接', '口', 'works']);
  assert.deepEqual(words('Merhaba dünya'), ['merhaba', 'dunya']);
});

test('our own Chinese voice coming back is an echo', () => {
  const guard = new EchoGuard();
  guard.remember('我们明天下午三点开会。', { start: 1000, end: 3000 });
  assert.equal(guard.isEcho('我们明天下午三点开会', 3500), true);
  assert.equal(guard.isEcho('好的，没问题，谢谢你', 3500), false);
});

test('a finished Chinese sentence is sent ahead while the speaker keeps talking', () => {
  assert.equal(finishedSentenceEnd('你好。我们开始'), '你好。'.length);
  assert.equal(finishedSentenceEnd('你好。'), 0);
  assert.equal(remainderAfter('你好。', '你好。我们开始吧'), '我们开始吧');
  const early = new EarlySentences();
  assert.equal(early.partial('谢谢大家参加今天的会议。我们'), '');
  assert.equal(early.partial('谢谢大家参加今天的会议。我们'), '谢谢大家参加今天的会议。');
  assert.equal(early.committed('谢谢大家参加今天的会议。我们开始吧。'), '我们开始吧。');
});
