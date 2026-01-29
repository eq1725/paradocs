// Adapter registry - maps adapter types to their implementations

import { SourceAdapter } from '../types';
import { nuforcAdapter } from './nuforc';
import { bfroAdapter } from './bfro';
import { shadowlandsAdapter } from './shadowlands';
import { ghostsOfAmericaAdapter } from './ghostsofamerica';
import { redditAdapter } from './reddit';
import { wikipediaAdapter } from './wikipedia';

// Registry of all available adapters
const adapters: Record<string, SourceAdapter> = {
  nuforc: nuforcAdapter,
  bfro: bfroAdapter,
  shadowlands: shadowlandsAdapter,
  ghostsofamerica: ghostsOfAmericaAdapter,
  reddit: redditAdapter,
  wikipedia: wikipediaAdapter,
  // Future adapters:
  // mufon: mufonAdapter,
};

export function getAdapter(adapterType: string): SourceAdapter | null {
  return adapters[adapterType] || null;
}

export function listAdapters(): string[] {
  return Object.keys(adapters);
}

export {
  nuforcAdapter,
  bfroAdapter,
  shadowlandsAdapter,
  ghostsOfAmericaAdapter,
  redditAdapter,
  wikipediaAdapter
};
