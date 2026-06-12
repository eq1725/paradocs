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
import { adcrfAdapter } from './adcrf';
import { iandsAdapter } from './iands';
// Session 10: New adapters for expanded source coverage
import { redditV2Adapter } from './reddit-v2';
import { youtubeAdapter } from './youtube';
import { newsAdapter } from './news';
import { erowidAdapter } from './erowid';
// Session 12: National folklore archives
import { duchasAdapter } from './duchas';
// Session 12: historical parapsychology (public domain)
import { sprAdapter } from './spr';
// Session 13: generic public-domain book corpora (config-driven; see
// src/lib/ingestion/pd-sources.config.ts)
import { pdTextAdapter } from './pd-text';

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
  adcrf: adcrfAdapter,
  iands: iandsAdapter,
  // Session 10: Expanded adapters
  'reddit-v2': redditV2Adapter,
  youtube: youtubeAdapter,
  news: newsAdapter,
  // erowid: erowidAdapter, // DISABLED — requires written permission from Erowid Center before scraping. Email sent April 2026. Re-enable once approved.
  // FACTS+LINK ONLY — Dúchas data is CC BY-NC 4.0 (© NFC, UCD). Adapter stores no
  // transcript text. Clean-room narrative enrichment stays disabled pending
  // written permission from NFC/Gaois (see scripts/duchas-narrative-enrich.ts).
  duchas: duchasAdapter,
  // Session 12: historical parapsychology (public domain)
  spr: sprAdapter,
  // Session 13: generic public-domain text corpora — config { sourceKey }
  // selects the work from PD_SOURCES (barrett, flammarion-unknown, …).
  'pd-text': pdTextAdapter,
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
  adcrfAdapter,
  iandsAdapter,
  // Session 10
  redditV2Adapter,
  youtubeAdapter,
  newsAdapter,
  erowidAdapter,
  // Session 12
  duchasAdapter,
  sprAdapter,
  // Session 13
  pdTextAdapter,
};
