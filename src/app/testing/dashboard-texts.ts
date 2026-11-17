import dashboard from '../../../public/i18n/dashboard/pt-BR.json';
import type { Texts } from '../core/dashboard-insights';

/** The dashboard's words as the app shows them: the real pt-BR file, with its `{{ param }}` placeholders filled in. */
export const dashboardTexts: Texts = (key, params = {}) => {
  let node: unknown = dashboard;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') throw new Error(`No dashboard text for ${key}`);
  return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params[name] ?? ''));
};
