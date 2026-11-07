# Promo video

The 50-second promo video, made with [Remotion](https://www.remotion.dev). Not part of the extension; it has its own `package.json`.

```
cd promo
npm install
npm run capture                  # frames: the test build on demo pages, against the e2e mocks
npm run voices                   # voices with ElevenLabs (ELEVENLABS_API_KEY in ../.env)
npm run voices -- --placeholder  # or Windows' own voice, free, for trying a cut
npm run render                   # out/live-interpreter-promo.mp4
npm run studio                   # edit and preview in the browser
```

- The words and the order of the scenes are in `src/script.js`; the scenes' length follows the voices.
- `voices` asks only for lines whose text or voice changed. The voices are chosen by role in `voices.mjs` (narrator: Sarah).
- The demo lines are the e2e mocks' sentences, so what is heard matches what the frames show.
- No lists of service names in the narration: the Chrome Web Store treats them as keyword spam.
- Generated files (`public/frames`, `public/audio`, `out`) are not committed.

Remotion is free for individuals and companies of up to three people; larger companies need a [company license](https://www.remotion.pro/license).
