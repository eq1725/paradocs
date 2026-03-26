// Adapter registry - maps adapter types to their implementations

import { SourceAdapter } from '../types';
import { nuforcAdapter } from './nuforc';
import { bfroAdapter } from './bfro';
import { shadowlandsAdapter } from './shadowlands';
import { ghostsOfAmericaAdapter } from './ghostsofamerica';
import { redditAdapter } from './reddit';
import { wikipediaAdapter } from './wikipedia';
import { nderfAdapter } from './nderf';
import { iandsAdapter } from './iands';
// Session 10: New adapters for expanded source coverage
import { redditV2Adapter } from './reddit-v2';
import { youtubeAdapter } from './youtube';
import { newsAdapter } from './news';
import { erowidAdapter } from './erowid';

// Registry of all available adapters
const adapters: Record<string, SourceAdapter> = {
  nuforc: nuforcAdapter,
  bfro: bfroAdapter,
  shadowlands: shadowlandsAdapter,
  ghostsofamerica: ghostsOfAmericaAdapter,
  reddit: redditAdapter,
  wikipedia: wikipediaAdapter,
  nderf: nderfAdapter,
  iands: iandsAdapter,
  // Session 10: Expanded adapters
  'reddit-v2': redditV2Adapter,
  youtube: youtubeAdapter,
  news: newsAdapter,
  erowid: erowidAdapter,
  // Future adapters:
  // mufon: mufonAdapter,
  // podcasts: podcastAdapter,
  // government: governmentDocsAdapter,
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
  wikipediaAdapter,
  nderfAdapter,
  iandsAdapter,
  // Session 10
  redditV2Adapter,
  youtubeAdapter,
  newsAdapter,
  erowidAdapter,
};
