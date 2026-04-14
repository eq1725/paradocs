// Adapter registry - maps adapter types to their implementations

import { SourceAdapter } from '../types';
import { nuforcAdapter } from './nuforc';
import { bfroAdapter } from './bfro';
import { shadowlandsAdapter } from './shadowlands';
import { ghostsOfAmericaAdapter } from './ghostsofamerica';
import { redditAdapter } from './reddit';
import { wikipediaAdapter } from './wikipedia';
import { nderfAdapter } from './nderf';
import { oberfAdapter } from './oberf';
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
  oberf: oberfAdapter,
  iands: iandsAdapter,
  // Session 10: Expanded adapters
  'reddit-v2': redditV2Adapter,
  youtube: youtubeAdapter,
  news: newsAdapter,
  // erowid: erowidAdapter, // DISABLED — requires written permission from Erowid Center before scraping. Email sent April 2026. Re-enable once approved.
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
  oberfAdapter,
  iandsAdapter,
  // Session 10
  redditV2Adapter,
  youtubeAdapter,
  newsAdapter,
  erowidAdapter,
};
