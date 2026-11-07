import { loadSettings } from '../shared/settings.js';
import { setLanguage, t, applyI18n, locale } from '../shared/i18n.js';
import { listRecordings, recordingBlob, deleteRecording, listTranscripts, getTranscript, deleteTranscript } from '../shared/recordings.js';
import { transcriptToText, transcriptToSrt } from '../shared/transcript.js';

const $ = (id) => document.getElementById(id);

function describe(meta, blob) {
  const date = new Date(meta.startedAt).toLocaleString(locale());
  const seconds = meta.endedAt ? Math.round((meta.endedAt - meta.startedAt) / 1000) : null;
  const duration = seconds == null ? t('rec.unfinished') : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const size = `${((blob?.size ?? meta.bytes) / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`;
  return `${date} · ${duration} · ${size}`;
}

function fileName(meta) {
  const d = new Date(meta.startedAt);
  const pad = (n) => String(n).padStart(2, '0');
  const ext = meta.mimeType?.includes('mp4') ? 'mp4' : 'webm';
  return `live-interpreter-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}

let objectUrl = null;

async function show(id) {
  const all = await listRecordings();
  const currentId = id || all[0]?.id;
  $('empty').hidden = all.length > 0;
  $('current').hidden = !currentId;
  if (currentId) {
    const found = await recordingBlob(currentId);
    if (found) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(found.blob);
      const player = $('player');
      player.src = objectUrl;
      // Recorded files carry no duration until the end has been seen once.
      player.addEventListener(
        'loadedmetadata',
        () => {
          if (player.duration === Infinity) {
            player.currentTime = 1e9;
            player.addEventListener('timeupdate', () => (player.currentTime = 0), { once: true });
          }
        },
        { once: true },
      );
      $('info').textContent = describe(found.meta, found.blob);
      $('download').href = objectUrl;
      $('download').download = fileName(found.meta);
      $('delete').onclick = async () => {
        if (!confirm(t('rec.deleteConfirm'))) return;
        await deleteRecording(currentId);
        history.replaceState(null, '', location.pathname);
        show(null);
      };
    }
  }
  const others = all.filter((r) => r.id !== currentId);
  $('othersBox').hidden = others.length === 0;
  $('others').replaceChildren(
    ...others.map((meta) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = describe(meta);
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = t('rec.open');
      open.addEventListener('click', () => {
        history.replaceState(null, '', `?id=${encodeURIComponent(meta.id)}`);
        show(meta.id);
      });
      li.append(label, open);
      return li;
    }),
  );
}

// ---- transcripts -----------------------------------------------------------------------

function stamp(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function describeTranscript(tr) {
  const minutes = tr.endedAt ? Math.max(1, Math.round((tr.endedAt - tr.startedAt) / 60000)) : null;
  return [
    new Date(tr.startedAt).toLocaleString(locale()),
    tr.title || tr.url || '',
    minutes ? t('rec.minutes', { n: minutes }) : t('rec.unfinished'),
    t('rec.lines', { n: tr.lines.length }),
  ]
    .filter(Boolean)
    .join(' · ');
}

const labels = () => ({
  title: t('tx.title'),
  date: t('tx.date'),
  them: t('tx.them'),
  me: t('tx.me'),
  speaker: t('tx.speaker'),
  formatDate: (ms) => new Date(ms).toLocaleString(locale()),
});

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function button(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

async function showTranscripts(openId) {
  const all = await listTranscripts();
  $('noTranscripts').hidden = all.length > 0;
  const view = $('transcriptView');
  const open = async (id) => {
    const tr = await getTranscript(id);
    view.hidden = !tr;
    if (tr) view.textContent = transcriptToText(tr, labels());
    for (const li of $('transcripts').children) li.classList.toggle('open', li.dataset.id === id);
  };
  $('transcripts').replaceChildren(
    ...all.map((tr) => {
      const li = document.createElement('li');
      li.dataset.id = tr.id;
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = describeTranscript(tr);
      li.append(
        label,
        button(t('rec.show'), () => {
          history.replaceState(null, '', `?transcript=${encodeURIComponent(tr.id)}`);
          open(tr.id);
        }),
        button(t('rec.txt'), () => download(transcriptToText(tr, labels()), `live-interpreter-${stamp(tr.startedAt)}.txt`, 'text/plain;charset=utf-8')),
        button(t('rec.srt'), () => download(transcriptToSrt(tr), `live-interpreter-${stamp(tr.startedAt)}.srt`, 'application/x-subrip;charset=utf-8')),
        button(t('rec.delete'), async () => {
          if (!confirm(t('rec.deleteTranscriptConfirm'))) return;
          await deleteTranscript(tr.id);
          showTranscripts();
        }),
      );
      return li;
    }),
  );
  view.hidden = true;
  if (openId) {
    await open(openId);
    $('transcriptsBox').scrollIntoView();
  }
}

const settings = await loadSettings();
setLanguage(settings.uiLanguage);
applyI18n();
document.title = t('rec.title');
const params = new URLSearchParams(location.search);
show(params.get('id'));
showTranscripts(params.get('transcript'));
