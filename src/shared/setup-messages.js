import { t, joinNames } from './i18n.js';

// The sentence for what missingServers() found: server addresses, or a model to choose.
export function describeMissingServers(missing) {
  const servers = missing.filter((id) => id !== 'model');
  if (servers.length) return t('err.serverMissing', { names: joinNames(servers.map((id) => t(`server.${id}`))) });
  return missing.includes('model') ? t('err.modelMissing') : '';
}
