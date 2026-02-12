# ParaDocs Bulk Data Ingestion Plan

## Executive Summary

This document outlines sources for mass data ingestion, organized by feasibility and data volume. Based on research of 2,500+ sources from the ParaDocs Research spreadsheet, we've identified **47 major sources** with bulk ingestion potential.

---

## 🔥 TIER 1: HIGHEST PRIORITY (Massive Datasets, Easy Access)

### 1. Reddit Archives (Academic Torrents)
**Estimated Records:** 1M+ paranormal posts/comments
**Access Method:** Torrent download (selective by subreddit)
**Data Format:** NDJSON (zstandard compressed)

**Target Subreddits:**
- r/aliens, r/UFOs, r/ufo
- r/paranormal, r/ghosts, r/Thetruthishere
- r/bigfoot, r/cryptids, r/cryptozoology
- r/NDE, r/AstralProjection
- r/Glitch_in_the_Matrix, r/HighStrangeness
- r/HumanoidEncounters, r/skinwalkers
- r/Missing411, r/UnexplainedPhotos

**Download Source:**
```
https://academictorrents.com/details/1614740ac8c94505e4ecb9d88be8bed7b6afddd4
```

**Alternative:** https://the-eye.eu/redarcs/ (direct download)

**Action Items:**
- [ ] Download torrent file
- [ ] Select paranormal subreddits only
- [ ] Parse NDJSON and extract: title, body, author, score, timestamp, subreddit
- [ ] Map to ParaDocs report schema

---

### 2. NUFORC (National UFO Reporting Center)
**Estimated Records:** 150,000+ UFO sightings
**Access Method:** Pre-built datasets (Hugging Face, Kaggle, GitHub)
**Data Format:** JSON/CSV

**Best Sources:**
| Source | Records | Link |
|--------|---------|------|
| Hugging Face | 147,890 | https://huggingface.co/datasets/kcimc/NUFORC |
| GitHub (timothyrenner) | ~140,000 | https://github.com/timothyrenner/nuforc_sightings_data |
| GitHub (planetsig) | 80,000+ | https://github.com/planetsig/ufo-reports |
| Kaggle | varies | https://www.kaggle.com/datasets/NUFORC/ufo-sightings |

**Data Fields:**
- date_time, reported, posted
- city, state, country
- shape, duration
- summary (description)
- latitude, longitude (geocoded)

**Action Items:**
- [ ] Download Hugging Face dataset (most current)
- [ ] Cross-reference with planetsig for geocoding
- [ ] Map to ParaDocs report schema
- [ ] Dedupe against existing ParaDocs reports

---

### 3. BFRO (Bigfoot Field Researchers Organization)
**Estimated Records:** 5,000+ Bigfoot sightings
**Access Method:** Pre-built datasets + scraper
**Data Format:** JSON/CSV

**Best Sources:**
| Source | Link |
|--------|------|
| GitHub (timothyrenner) | https://github.com/timothyrenner/bfro_sightings_data |
| Kaggle | https://www.kaggle.com/datasets/chemcnabb/bfro-bigfoot-sighting-report |
| Data.world | https://data.world/timothyrenner/bfro-sightings-data |
| Official GPS POI | http://www.bfro.net/REF/gps_poi.asp |

**Data Fields:**
- Report ID, classification (A/B/C)
- Date, year, season, month
- State, county, location
- Full narrative description
- Coordinates

**Action Items:**
- [ ] Download from GitHub repo
- [ ] Cross-reference with Kaggle for completeness
- [ ] Map to ParaDocs report schema (category: cryptids)

---

### 4. The Black Vault (Declassified Documents)
**Estimated Records:** 2M+ pages of documents
**Access Method:** Directory scraping / GitHub mirror
**Data Format:** PDF

**Access Points:**
- Direct: `documents.theblackvault.com` (Apache directory)
- GitHub Mirror: https://github.com/YetAnotherMorty/The-Black-Vault-File-Dump
- Main Archive: https://www.theblackvault.com/documentarchive/

**Collections Include:**
- Project Blue Book (10,000+ cases)
- Project Sign & Grudge
- CIA UFO files
- FBI declassified documents
- Pentagon UAP files

**Action Items:**
- [ ] Check GitHub mirror for pre-downloaded files
- [ ] Script directory scraping for targeted collections
- [ ] Extract text from PDFs using OCR if needed
- [ ] Create metadata records for document archive

---

## 🌟 TIER 2: HIGH PRIORITY (Major Research Databases)

### 5. NDERF (Near Death Experience Research Foundation)
**Estimated Records:** 5,000+ NDE accounts
**Access Method:** Academic dataset or careful scraping
**Data Format:** Structured text/surveys

**Best Source:**
- Zenodo: https://zenodo.org/records/16949744

**Data Fields:**
- Full narrative account
- 33+ survey questions (visual experiences, emotions, life review, etc.)
- Demographics (age, gender, nationality)
- Date of experience

**Legal Note:** Joint copyright with experiencers. Use for research only.

**Action Items:**
- [ ] Download Zenodo dataset
- [ ] Supplement with IANDS accounts if available
- [ ] Map to ParaDocs schema (category: psychological_experiences)

---

### 6. Phantoms and Monsters
**Estimated Records:** 3,000-5,000+ posts (19 years of content)
**Access Method:** Blogger API / RSS scraping
**Data Format:** JSON/HTML

**Access Points:**
```
https://phantomsandmonsters.blogspot.com/feeds/posts/default?alt=json&max-results=500
```

**Categories Covered:**
- Cryptid encounters (Bigfoot, Mothman, Dogman)
- UFO/alien encounters
- Ghost/paranormal activity
- Humanoid encounters

**Action Items:**
- [ ] Query Blogger JSON API with pagination
- [ ] Parse post content, date, labels
- [ ] Categorize by label tags
- [ ] Map to ParaDocs schema

---

### 7. Paranormal Database UK
**Estimated Records:** 14,800+ records
**Access Method:** Web scraping
**Data Format:** HTML (structured)

**URL Pattern:**
```
https://paranormaldatabase.com/[county]/[county]data.php
```

**Categories:**
- Haunting Manifestations
- Cryptozoology (ABCs, Shuck creatures)
- UFO Sightings
- Fairy/Folklore

**Data Fields:**
- Location, Type, Date/Time
- Description narrative
- Geographic coordinates (some)

**Action Items:**
- [ ] Build county-by-county scraper
- [ ] Implement polite rate limiting (1-2s delays)
- [ ] Parse HTML tables for structured data
- [ ] Map to ParaDocs schema

---

## 🔹 TIER 3: SPECIALIZED DATABASES

### 8. Dogman Encounters
**URL:** https://dogmanencounters.com/
**Estimated Records:** 500+
**Access:** Web scraping

### 9. GCBRO (Gulf Coast Bigfoot Research)
**URL:** http://gcbro.com/
**Estimated Records:** 1,000+
**Access:** Web scraping

### 10. Sasquatch Chronicles
**URL:** https://sasquatchchronicles.com/
**Estimated Records:** 1,000+ (podcast transcripts)
**Access:** Web scraping, podcast archives

### 11. Haunted Places Directory
**URLs:**
- https://www.hauntedplaces.org/
- https://www.haunted-places.com/
**Estimated Records:** 10,000+ locations
**Access:** Web scraping

### 12. UFO Casebook
**URL:** https://ufocasebook.com/
**Estimated Records:** 5,000+
**Access:** Web scraping

### 13. UFO Evidence
**URL:** http://ufoevidence.org/
**Estimated Records:** 3,000+
**Access:** Web scraping

### 14. NICAP (National Investigations Committee)
**URL:** https://www.nicap.org/
**Estimated Records:** Historical archive
**Access:** Web scraping, Internet Archive

### 15. CUFOS (Center for UFO Studies)
**URL:** https://cufos.org/
**Estimated Records:** Research papers, case files
**Access:** Direct contact recommended

---

## Implementation Priority Matrix

| Source | Volume | Effort | Priority | Timeline |
|--------|--------|--------|----------|----------|
| Reddit Archives | 1M+ | Low | 🔴 Critical | Week 1 |
| NUFORC | 150K | Low | 🔴 Critical | Week 1 |
| BFRO | 5K | Low | 🟡 High | Week 1 |
| Black Vault | 2M pages | Medium | 🟡 High | Week 2 |
| NDERF | 5K | Low | 🟡 High | Week 1 |
| Phantoms & Monsters | 5K | Medium | 🟢 Medium | Week 2 |
| Paranormal DB UK | 15K | Medium | 🟢 Medium | Week 2 |
| Haunted Places | 10K | Medium | 🟢 Medium | Week 3 |
| Tier 3 Sources | 15K total | High | 🔵 Low | Week 3-4 |

---

## Technical Requirements

### Data Processing Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Source    │───▶│   Extract   │───▶│  Transform  │───▶│    Load     │
│  (API/Scrape)│    │  (Raw Data) │    │  (Schema)   │    │ (Supabase)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Schema Mapping Requirements

Each source needs mapping to ParaDocs fields:
- `title` - Report title/headline
- `summary` - Brief description
- `description` - Full narrative
- `category` - Map to ParaDocs categories
- `phenomenon_type_id` - Link to phenomenon types
- `event_date` - Date of occurrence
- `location_name` - City/place name
- `country`, `state`, `county`
- `latitude`, `longitude`
- `source_url` - Original source link
- `source_name` - Database name
- `credibility` - Initial credibility rating

### Deduplication Strategy

1. Hash-based: Generate content hashes to detect exact duplicates
2. Fuzzy matching: Use location + date + category for near-duplicates
3. Source priority: Prefer first-party sources over aggregators

---

## Estimated Total Records

| Category | Estimated Records |
|----------|-------------------|
| UFOs/UAP | 200,000+ |
| Cryptids | 15,000+ |
| Ghosts/Hauntings | 30,000+ |
| NDEs/Consciousness | 10,000+ |
| Reddit Posts | 500,000+ |
| Documents | 2,000,000+ pages |
| **TOTAL** | **750,000+ records** |

---

## Next Steps

1. **Week 1:** Download pre-built datasets (NUFORC, BFRO, NDERF, Reddit)
2. **Week 2:** Build scrapers for blog/database sites
3. **Week 3:** Process Black Vault documents
4. **Week 4:** Ingest Tier 3 sources
5. **Ongoing:** Dedupe, quality check, and enhance with AI summaries

---

*Last Updated: February 2026*
