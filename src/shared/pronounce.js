// How a translation is read aloud. A voice reads every word with its own language's
// rules, so an English term in Turkish speech ("API", "Apple") or a Turkish name in English
// speech ("Şükrü") comes out wrong. Three things help:
//
//  - The translator marks such words with how they sound: [[Apple|epıl]] (the wiki-link
//    form, which language models write reliably; rarer brackets came back broken). The screen and
//    the transcript show "Apple"; a voice that knows only one language (the local speech
//    server) reads "epıl"; ElevenLabs and OpenAI, which handle mixed text, get "Apple".
//  - A pronunciation list (built in for the local voices, plus the user's own) covers what
//    the translator did not mark: free translation services and Soniox mark nothing.
//  - Short Turkish acronyms (SGK, THY) are read letter by letter in Turkish.

const MARK = /\[\[([^[\]|]*)(?:\|+([^[\]]*))?\]\]/g;
// A mark the model did not close properly ("[[API|ey pi ay0</sup>"): the word stays; its
// pronunciation (up to four words) and the odd characters after it go.
const BROKEN = /\[\[([^[\]|]{1,40}?)\|+(?:[\p{L}'-]+\s?){1,4}?[^\s\p{L}'-]+\S*/gu;
// A mark left open with nothing odd after it: the word stays, the pronunciation's first word goes.
const OPEN = /\[\[([^[\]|]{1,40}?)\|+\S*/gu;

function resolve(text, pick) {
  return String(text || '')
    .replace(MARK, (_, word, say) => pick(word.trim(), say))
    .replace(BROKEN, (_, word) => word)
    .replace(OPEN, (_, word) => word)
    .replace(/\[\[|\]\]/g, '');
}

// What the screen shows: the original spelling, no marks.
export function displayText(text) {
  return resolve(text, (word) => word);
}

// True while text ends inside an unclosed mark (a stream cut there would break it).
export function insideMark(text, index = text.length) {
  const before = text.slice(0, index);
  return before.lastIndexOf('[[') > before.lastIndexOf(']]');
}

// "API = ey pi ay" or "Apple: epıl", one per line.
export function parseLexicon(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([^=:]+?)\s*[=:]\s*(.+?)\s*$/);
    if (m && m[1] && m[2]) out.push([m[1], m[2]]);
  }
  return out;
}

// For a Turkish voice that knows no English (the local speech server).
const TR_BUILTIN = parseLexicon(`
AI = ey ay
API = ey pi ay
AWS = ey dabılyu es
B2B = bi tu bi
CEO = si i o
CFO = si ef o
CTO = si ti o
COO = si o o
CPU = si pi yu
GPU = ci pi yu
CRM = si ar em
ERP = i ar pi
HR = eyç ar
IT = ay ti
KPI = key pi ay
PDF = pi di ef
QA = kyu ey
SaaS = sas
SQL = es kyu el
UI = yu ay
URL = yu ar el
USB = yu es bi
UX = yu eks
VPN = vi pi en
iOS = ay o es
OK = okey
ChatGPT = çet ci pi ti
GPT = ci pi ti
OpenAI = opın ey ay
Claude = klod
Apple = epıl
Google = gugıl
Microsoft = maykrosoft
Teams = tims
Zoom = zum
iPhone = ayfon
iPad = aypad
MacBook = mekbuk
Windows = vindovs
Excel = eksel
PowerPoint = pavır poynt
Outlook = autluk
OneDrive = van drayv
SharePoint = şeır poynt
YouTube = yutub
Facebook = feysbuk
WhatsApp = vatsap
LinkedIn = linkedin
Amazon = emızon
Netflix = netfliks
Slack = slek
Jira = cira
GitHub = git hab
deadline = dedlayn
feedback = fidbek
meeting = miting
update = apdeyt
upgrade = apgreyd
download = davnlod
upload = aplod
software = softver
hardware = hardver
browser = brauzır
cloud = klaud
email = imeyl
e-mail = imeyl
online = onlayn
offline = oflayn
startup = startap
sprint = sprint
backend = bekend
frontend = frontend
`);

const BUILTIN = { tr: TR_BUILTIN };

// Turkish letter names, for short acronyms read one letter at a time.
const TR_LETTERS = { A: 'a', B: 'be', C: 'ce', Ç: 'çe', D: 'de', E: 'e', F: 'fe', G: 'ge', Ğ: 'yumuşak ge', H: 'he', I: 'ı', İ: 'i', J: 'je', K: 'ke', L: 'le', M: 'me', N: 'ne', O: 'o', Ö: 'ö', P: 'pe', R: 're', S: 'se', Ş: 'şe', T: 'te', U: 'u', Ü: 'ü', V: 've', Y: 'ye', Z: 'ze' };

// SGK, THY, AB: read letter by letter. NATO, TÜBİTAK, ASELSAN are said as words.
function spellTurkishAcronyms(text) {
  return text.replace(/(?<![\p{L}\p{N}])[A-ZÇĞİÖŞÜ]{2,5}(?![\p{L}\p{N}])/gu, (word) => {
    const vowels = (word.match(/[AEIİOÖUÜ]/g) || []).length;
    if (word.length > 3 && vowels > 0) return word;
    if (![...word].every((c) => TR_LETTERS[c])) return word;
    return [...word].map((c) => TR_LETTERS[c]).join(' ');
  });
}

// A Turkish name for a voice that knows only English: Şükrü -> Shookroo, roughly.
function englishForTurkishLetters(text) {
  return text.replace(/[\p{L}]*[şçğıöüŞÇĞİÖÜ][\p{L}]*/gu, (word) =>
    word
      .replace(/ş/g, 'sh')
      .replace(/Ş/g, 'Sh')
      .replace(/ç/g, 'ch')
      .replace(/Ç/g, 'Ch')
      .replace(/c/g, 'j')
      .replace(/C/g, 'J')
      .replace(/[ğĞ]/g, '')
      .replace(/ı/g, 'uh')
      .replace(/İ/g, 'I')
      .replace(/ö/g, 'er')
      .replace(/Ö/g, 'Er')
      .replace(/ü/g, 'ew')
      .replace(/Ü/g, 'Ew'),
  );
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words; a key in capitals (IT, AI) matches only in capitals, others in any case.
function applyLexicon(text, entries) {
  let out = text;
  for (const [word, say] of [...entries].sort((a, b) => b[0].length - a[0].length)) {
    const caps = word === word.toUpperCase() && /[A-Z]/.test(word);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, caps ? 'gu' : 'giu');
    out = out.replace(re, say);
  }
  return out;
}

// The text a voice is given.
//   language: the language the voice speaks ('tr', 'en', ...)
//   singleLanguage: the voice knows only that language (the local speech server)
//   lexicon: the user's own list (parseLexicon), used for every voice
//   enabled: false leaves the words as they are (marks are still removed)
export function speechText(text, { language = '', singleLanguage = false, lexicon = [], enabled = true } = {}) {
  const lang = String(language).split(/[-_]/)[0].toLowerCase();
  let out = resolve(text, (word, say) => (enabled && singleLanguage && say?.trim() ? say.trim() : word));
  if (!enabled) return out;
  if (lexicon.length) out = applyLexicon(out, lexicon);
  if (!singleLanguage) return out;
  if (BUILTIN[lang]) out = applyLexicon(out, BUILTIN[lang]);
  if (lang === 'tr') out = spellTurkishAcronyms(out);
  if (lang === 'en') out = englishForTurkishLetters(out);
  return out;
}

// What the translator is asked to do when its words will be spoken.
export function markingRule(targetEnglishName, target) {
  const lang = String(target || '').split(/[-_]/)[0].toLowerCase();
  const examples =
    lang === 'tr'
      ? '[[Apple|epıl]], [[API|ey pi ay]], [[iPhone|ayfon]], [[Microsoft Teams|maykrosoft tims]]'
      : lang === 'en'
        ? '[[Şükrü|Shoo-kroo]], [[Kadıköy|Kah-duh-koy]], [[TÜBİTAK|Too-bee-tahk]]'
        : '[[iPhone|…]], [[API|…]] (the part after | spelled the way a ' + targetEnglishName + ' speaker would write how it sounds)';
  return [
    `- The reply is read aloud by a ${targetEnglishName} voice. Write every word that a ${targetEnglishName} speaker would say in another language's way (a technical term or acronym kept in English, a brand, product or personal name from another language) as [[original|how it sounds]], with two square brackets on each side and one | between, the second part spelled with ${targetEnglishName} spelling. For example: ${examples}.`,
    `- Mark only such words; never mark ordinary ${targetEnglishName} words, and never put anything else between [[ and ]].`,
  ];
}
