import Anthropic from '@anthropic-ai/sdk';
import { languageByCode, AUTO_LANGUAGE } from '../shared/languages.js';
import { SentenceSplitter, isOnlyPunctuation } from '../shared/text.js';
import { markingRule } from '../shared/pronounce.js';
import { t } from '../shared/i18n.js';

// Models that accept the server-side refusal fallback on the Claude API. Claude Haiku 5.5
// has no server-side fallback, so its requests go without the parameter.
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export class TranslationRefusedError extends Error {
  constructor(details) {
    super(t('claude.refused'));
    this.details = details;
  }
}

// from may be AUTO_LANGUAGE: the utterance can be in any language. media: the sound of a
// video or radio tab the user is following, rather than a call.
// marked: the reply will be spoken; foreign words come marked with how they sound.
export function buildSystemPrompt({ from, to, myLanguage, theirLanguage, meetingContext, keyterms, concise, media = false, marked = false }) {
  const dst = languageByCode(to).english;
  const mine = languageByCode(myLanguage).english;
  const theirs = languageByCode(theirLanguage).english;
  const scene = media
    ? `You are a professional simultaneous interpreter. The user is watching or listening to a video, a broadcast or a radio stream and understands ${dst}. Each request carries one utterance from it, captured by live speech recognition, and your reply is shown as a subtitle or spoken aloud the moment you produce it.`
    : `You are a professional simultaneous interpreter in a live video call. The user speaks ${mine}; their counterpart speaks ${theirs}. Each request carries one utterance captured by live speech recognition, and your reply is spoken aloud by a text-to-speech voice the moment you produce it.`;
  const task =
    from === AUTO_LANGUAGE
      ? `Translate the utterance into ${dst}. It can be in any language: recognize which one from the text itself.`
      : `Translate the utterance from ${languageByCode(from).english} into ${dst}.`;
  const lines = [
    scene,
    '',
    task,
    '',
    'Rules:',
    '- Reply with the translation only: no quotes, labels, notes, alternatives or explanations.',
    '- Translate faithfully. Keep the meaning, intent, tone and level of formality. Never answer, add to, summarize or comment on what was said.',
    '- The text is a live transcript. Ignore filler words, repetitions and false starts, and quietly correct obvious recognition errors from the context.',
    '- The utterance may be only part of a longer sentence. Translate it so it flows when spoken right after the previous part, without guessing how it will end.',
    `- Use natural spoken ${dst}, the way a skilled human interpreter would say it aloud. Write numbers, dates, times, prices and units the way a ${dst} speaker would read them out.`,
    '- Keep the names of people, companies and products, and technical terms, as they are unless the glossary says otherwise.',
    `- If the utterance is already in ${dst}, repeat it unchanged.`,
    '- If the utterance has no words at all (only noise or a filler sound), reply with nothing.',
  ];
  if (marked) lines.push(...markingRule(dst, to));
  if (concise) {
    lines.push('- The listener is falling behind the speaker right now: make this translation noticeably shorter, keeping every important point.');
  }
  if (meetingContext?.trim() && !media) {
    lines.push('', 'About this meeting (background, given by the user):', meetingContext.trim());
  }
  if (keyterms?.length) {
    lines.push('', `Glossary (keep these spelled exactly like this): ${keyterms.join(', ')}`);
  }
  return lines.join('\n');
}

export function buildUserMessage({ text, from, to, history }) {
  const dst = languageByCode(to).english;
  const pair = from === AUTO_LANGUAGE ? `into ${dst}` : `${languageByCode(from).english} to ${dst}`;
  const parts = [];
  if (history?.length) {
    parts.push('Conversation so far, for context only (do not translate it):');
    for (const item of history) {
      const who = item.dir === 'in' ? 'Counterpart' : 'User';
      parts.push(`${who}: ${item.source}${item.translation ? `  (interpreted as: ${item.translation})` : ''}`);
    }
    parts.push('');
  }
  parts.push(`Utterance to interpret, ${pair}:`, '<utterance>', text, '</utterance>');
  return parts.join('\n');
}

export function buildRequest({ model, system, user }) {
  const params = {
    model,
    max_tokens: 2048,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (SERVER_FALLBACK_MODELS.has(model)) {
    return { beta: true, params: { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } };
  }
  return { beta: false, params };
}

export class Translator {
  // With a fallback behind it, Claude gets less time and fewer retries, so a sentence
  // reaches the fallback before the pipeline gives up on it (TRANSLATION_STALL_MS).
  constructor({ apiKey, model, myLanguage, theirLanguage, meetingContext = '', keyterms = [], onUsage, timeoutMs = 30_000, maxRetries = 2 }) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries, timeout: timeoutMs });
    this.onUsage = onUsage;
    this.model = model;
    this.myLanguage = myLanguage;
    this.theirLanguage = theirLanguage;
    this.meetingContext = meetingContext;
    this.keyterms = keyterms;
  }

  update({ model, myLanguage, theirLanguage, meetingContext, keyterms }) {
    if (model) this.model = model;
    if (myLanguage) this.myLanguage = myLanguage;
    if (theirLanguage) this.theirLanguage = theirLanguage;
    if (meetingContext !== undefined) this.meetingContext = meetingContext;
    if (keyterms) this.keyterms = keyterms;
  }

  // Confirms the key works and the chosen model is available to it.
  async verify() {
    await this.client.models.retrieve(this.model);
  }

  // Yields the translation in speakable pieces while Claude is still writing it.
  async *translate({ text, from, to, history, concise, media, marked, signal }) {
    const system = buildSystemPrompt({
      from,
      to,
      myLanguage: this.myLanguage,
      theirLanguage: this.theirLanguage,
      meetingContext: this.meetingContext,
      keyterms: this.keyterms,
      concise,
      media,
      marked,
    });
    const user = buildUserMessage({ text, from, to, history });
    const { beta, params } = buildRequest({ model: this.model, system, user });
    const stream = beta ? this.client.beta.messages.stream(params, { signal }) : this.client.messages.stream(params, { signal });

    // A server-side fallback arrives as a `fallback` content block; the text streamed
    // before it is kept and the fallback model continues, so text deltas are simply
    // collected in order.
    const splitter = new SentenceSplitter();
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        for (const piece of splitter.push(event.delta.text)) {
          if (!isOnlyPunctuation(piece)) yield piece;
        }
      }
    }
    const message = await stream.finalMessage();
    this.onUsage?.(message.model || this.model, message.usage);
    if (message.stop_reason === 'refusal') throw new TranslationRefusedError(message.stop_details);
    const rest = splitter.flush();
    if (rest && !isOnlyPunctuation(rest)) yield rest;
  }
}

export function describeClaudeError(err) {
  if (err instanceof TranslationRefusedError) return err.message;
  if (err?.name === 'TimeoutError') return t('translation.stalled');
  if (err instanceof Anthropic.AuthenticationError) return t('claude.auth');
  if (err instanceof Anthropic.PermissionDeniedError) return t('claude.permission');
  if (err instanceof Anthropic.NotFoundError) return t('claude.notFound');
  if (err instanceof Anthropic.RateLimitError) return t('claude.rateLimit');
  if (err instanceof Anthropic.APIUserAbortError) return t('claude.aborted');
  if (err instanceof Anthropic.APIConnectionError) return t('claude.connection');
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402 || err.type === 'billing_error') return t('claude.billing');
    if (err.status === 529 || err.type === 'overloaded_error') return t('claude.overloaded');
    return t('claude.other', { status: err.status ?? t('common.unknown'), message: err.message });
  }
  return err?.message || String(err);
}

// How long Claude is left alone after a failure while free translation stands in.
export function claudeRestMs(err) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError) {
    return Infinity; // the key or the model will not start working mid-call
  }
  if (err instanceof Anthropic.APIError && (err.status === 402 || err.type === 'billing_error')) return Infinity;
  if (err instanceof Anthropic.RateLimitError) return 30_000;
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.type === 'overloaded_error')) return 30_000;
  if (err instanceof Anthropic.APIConnectionError || err?.name === 'TimeoutError') return 15_000;
  return 0; // a refusal or a one-off error: try Claude again with the next sentence
}

export function isAbort(err) {
  return err?.name === 'AbortError' || err instanceof Anthropic.APIUserAbortError;
}
