// Chrome's own translator (Chrome 138 or newer, desktop) translates on this computer,
// for free and without a key. It is the last step of free translation. Its language
// packs download on first use, and a download can only start right after a click on a
// page, which the call's offscreen document never gets: the settings page and the
// popup start it instead.

export function localPairs(settings) {
  return [
    [settings.theirLanguage, settings.myLanguage],
    [settings.myLanguage, settings.theirLanguage],
  ];
}

// 'ready' | 'download' (packs not on this computer yet) | 'unavailable' (pair not offered) | 'unsupported' (Chrome too old)
export async function localTranslationState(pairs, api = globalThis.Translator) {
  if (typeof api?.availability !== 'function') return 'unsupported';
  const states = await Promise.all(
    pairs.map(([from, to]) => api.availability({ sourceLanguage: from, targetLanguage: to }).catch(() => 'unavailable')),
  );
  if (states.includes('unavailable')) return 'unavailable';
  return states.every((state) => state === 'available') ? 'ready' : 'download';
}

// Call straight from a click handler: both downloads start while the click still counts.
export async function prepareLocalTranslation(pairs, { onProgress, api = globalThis.Translator } = {}) {
  if (typeof api?.create !== 'function') return 'unsupported';
  const loaded = pairs.map(() => 0);
  await Promise.allSettled(
    pairs.map(([from, to], i) =>
      api
        .create({
          sourceLanguage: from,
          targetLanguage: to,
          monitor(monitor) {
            monitor.addEventListener('downloadprogress', (event) => {
              loaded[i] = event.loaded;
              onProgress?.(loaded.reduce((a, b) => a + b, 0) / loaded.length);
            });
          },
        })
        .then((translator) => translator.destroy?.()),
    ),
  );
  return localTranslationState(pairs, api);
}

// Why the built-in translator is missing: an old Chrome, or a Chromium browser that
// leaves it out (Brave, Opera and the like report a recent Chrome version but have no
// Translator). Returns 'old' or 'browser'.
export function missingTranslatorReason(nav = globalThis.navigator) {
  const brands = nav?.userAgentData?.brands || [];
  const brand = brands.find((b) => /chrom/i.test(b.brand));
  const fromUa = /Chrome\/(\d+)/.exec(nav?.userAgent || '')?.[1];
  const major = Number(brand?.version || fromUa || 0);
  if (nav?.brave || (major && major >= 138)) return 'browser';
  return 'old';
}
