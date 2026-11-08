import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayText, speechText, parseLexicon, insideMark } from '../../src/shared/pronounce.js';
import { SentenceSplitter } from '../../src/shared/text.js';
import { buildSystemPrompt } from '../../src/offscreen/translator.js';
import { openaiSynthesize } from '../../src/offscreen/openai-speech.js';
import { DirectionPipeline, History, Speaker } from '../../src/offscreen/pipeline.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('the screen shows the words as written, without marks', () => {
  assert.equal(displayText('Yeni [[iPhone|ayfon]] ve [[API|ey pi ay]] hazır.'), 'Yeni iPhone ve API hazır.');
  assert.equal(displayText('Bozuk [[işaret ve [[Apple]] kaldı'), 'Bozuk işaret ve Apple kaldı');
  // Closings a small model got wrong never reach the screen.
  assert.equal(displayText('Yeni [[API|ey pi ay0</sup> haftaya, [[Google|guugıl###} da.'), 'Yeni API haftaya, Google da.');
  assert.equal(displayText('[[Microsoft Teams||maykrosof tims]] üzerinden'), 'Microsoft Teams üzerinden');
  assert.equal(displayText('the [[ Kadıköy|Kah-duh-koy]] office'), 'the Kadıköy office');
  assert.equal(insideMark('Bu [[Apple|ep'), true);
  assert.equal(insideMark('Bu [[Apple|epıl]] iyi'), false);
});

test('a one-language voice reads how a marked word sounds; the others get the word', () => {
  const text = '[[Apple|epıl]] yeni [[API|ey pi ay]] duyurdu.';
  assert.equal(speechText(text, { language: 'tr', singleLanguage: true }), 'epıl yeni ey pi ay duyurdu.');
  assert.equal(speechText(text, { language: 'tr', singleLanguage: false }), 'Apple yeni API duyurdu.');
  assert.equal(speechText(text, { language: 'tr', singleLanguage: true, enabled: false }), 'Apple yeni API duyurdu.');
});

test('unmarked text: built-in words and short Turkish acronyms for the local Turkish voice', () => {
  const said = speechText('CEO, SGK ve NATO toplantısında Microsoft Teams kullandı.', { language: 'tr', singleLanguage: true });
  assert.equal(said, 'si i o, se ge ke ve NATO toplantısında maykrosoft tims kullandı.');
  // Capital-letter entries match only in capitals: "it" is not IT.
  assert.equal(speechText('it IT', { language: 'tr', singleLanguage: true }), 'it ay ti');
  // ElevenLabs and OpenAI read mixed text themselves: no built-in changes for them.
  assert.equal(speechText('CEO ve SGK', { language: 'tr' }), 'CEO ve SGK');
});

test('a Turkish name for a local English voice is spelled the English way', () => {
  assert.equal(speechText('Thanks, Şükrü.', { language: 'en', singleLanguage: true }), 'Thanks, Shewkrew.');
  assert.equal(speechText('Meet [[Şükrü|Shoo-kroo]].', { language: 'en', singleLanguage: true }), 'Meet Shoo-kroo.');
});

test('the user list applies to every voice, whole words only', () => {
  const lexicon = parseLexicon('Kubernetes = kubernetis\nAPI: ey pi ay\nbozuk satır');
  assert.deepEqual(lexicon, [['Kubernetes', 'kubernetis'], ['API', 'ey pi ay']]);
  assert.equal(speechText('Kubernetes ve API, APIs', { language: 'tr', lexicon }), 'kubernetis ve ey pi ay, APIs');
});

test('a translation is never cut inside a mark', () => {
  const s = new SentenceSplitter();
  const pieces = s.push('Toplantıda [[Microsoft Teams, Inc.|maykrosoft tims ink]] ile, bütün ekip birlikte konuştuk. Sonra');
  assert.ok(pieces.every((p) => !insideMark(p)), JSON.stringify(pieces));
  assert.ok(pieces[0].includes(']]'));
});

test('the translator is asked for marks only when the translation is spoken', async () => {
  const marked = buildSystemPrompt({ from: 'en', to: 'tr', myLanguage: 'tr', theirLanguage: 'en', marked: true });
  assert.ok(marked.includes('[[Apple|epıl]]'));
  assert.ok(!buildSystemPrompt({ from: 'en', to: 'tr', myLanguage: 'tr', theirLanguage: 'en' }).includes('[['));

  const jobs = [];
  const emitted = [];
  const spoken = [];
  const pipeline = new DirectionPipeline({
    dir: 'in',
    from: 'en',
    to: 'tr',
    translator: {
      async *translate(job) {
        jobs.push(job);
        yield '[[Apple|epıl]] yeni bir ürün duyurdu.';
      },
    },
    speaker: new Speaker({
      sink: { push() {}, end() {}, flush() {}, backlog: () => 0 },
      synth: async function* (item) {
        spoken.push(item.text);
        yield new Int16Array(1);
      },
    }),
    history: new History(8),
    markWords: () => true,
    emit: (e) => emitted.push(e),
  });
  pipeline.onCommitted('Apple announced a new product.');
  await sleep(20);
  assert.equal(jobs[0].marked, true);
  assert.equal(emitted.at(-1).translation, 'Apple yeni bir ürün duyurdu.');
  assert.deepEqual(spoken, ['[[Apple|epıl]] yeni bir ürün duyurdu.'], 'the voice gets the marks to resolve');
  pipeline.setMode('text');
  pipeline.onCommitted('Apple again.');
  await sleep(20);
  assert.equal(jobs[1].marked, false, 'subtitles only: nothing to mark');
});

test("OpenAI's speech models are told how to say foreign words; others are not", async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(new Uint8Array(4), { status: 200, headers: { 'content-type': 'audio/pcm' } });
  };
  for (const model of ['gpt-4o-mini-tts', 'tts-1']) {
    for await (const _ of openaiSynthesize({ base: 'https://api.openai.com/v1', key: 'k', model, voice: 'alloy', text: 'Merhaba', instructions: 'Say API in English.', fetchImpl })) {
      // drain
    }
  }
  assert.equal(bodies[0].instructions, 'Say API in English.');
  assert.equal('instructions' in bodies[1], false);
});
