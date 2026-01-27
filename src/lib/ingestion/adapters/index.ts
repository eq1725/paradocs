// Adapter registry - maps adapter types to their implementations

import { SourceAdapter } from '../types';
import { nuforcAdapter } from './nuforc';

// Registry of all available adapters
const adapters: Record<string, SourceAdapter> = {
  nuforc: nuforcAdapter,
  // Future adapters:
  // mufon: mufon Adapter,
  // reddit: redditAdapter,
  // bfro: bfroAdapter,
};

export function getAdapter(adapterType: string): SourceAdapter | null {
  return adapters[adapterType] || null;
}

export function listAdapters(): string[] {
  return Object.keys(adapters);
}

export { nuforcAdapter };
