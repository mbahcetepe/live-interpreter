// The person's own servers: Ollama for translation and the local speech server
// (speech-server/). Their addresses are typed into the settings, so the extension asks
// for access to each one when it is tested there (optional host permissions).
//
// Ollama refuses requests whose Origin header it does not know, and the browser sends
// one with every POST. Rather than asking for OLLAMA_ORIGINS on the server, the extension
// removes that header from its own requests to the addresses in its settings, and only
// from its own: the rule names this extension as the initiator, so a web page's request
// to the same server still carries its origin and is refused.

const OLLAMA_PORT = '11434';

// "100.65.147.84" or "http://100.65.147.84:11434/" -> "http://100.65.147.84:11434"
export function serverBase(url, { defaultPort = OLLAMA_PORT } = {}) {
  let text = String(url || '').trim();
  if (!text) return '';
  if (!/^[a-z]+:\/\//i.test(text)) text = `http://${text}`;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  // A bare address gets the server's usual port; one behind https (a proxy) keeps 443.
  const typedPort = /^[^/]*:\d+/.test(text.replace(/^[a-z]+:\/\//i, ''));
  if (parsed.protocol === 'http:' && !parsed.port && !typedPort && defaultPort) parsed.port = defaultPort;
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
}

// The permission pattern for a server ("http://100.65.147.84/*"; a pattern covers every port).
export function originPattern(base) {
  try {
    const u = new URL(base);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return '';
  }
}

export function hostOf(base) {
  try {
    return new URL(base).hostname;
  } catch {
    return '';
  }
}

// The servers named in the settings, each with what it is for.
export function configuredServers(settings) {
  const out = [];
  const add = (url, kind, defaultPort) => {
    const base = serverBase(url, { defaultPort });
    if (base) out.push({ base, kind });
  };
  if (settings?.claudeModel === 'ollama') {
    add(settings.ollamaUrl, 'ollama');
    add(settings.ollamaBackupUrl, 'ollama');
  }
  if (settings?.speechProvider === 'local') add(settings.localSpeechUrl, 'speech', '8765');
  return out;
}

// declarativeNetRequest rules that drop the Origin header from this extension's own
// requests to its Ollama servers. Ids start at 100; older ones are replaced.
export function originRules(settings, extensionId) {
  const hosts = [...new Set(configuredServers(settings).filter((s) => s.kind === 'ollama').map((s) => hostOf(s.base)).filter(Boolean))];
  if (!hosts.length) return [];
  return [
    {
      id: 100,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
      condition: { requestDomains: hosts, initiatorDomains: [extensionId], resourceTypes: ['xmlhttprequest', 'other'] },
    },
  ];
}
