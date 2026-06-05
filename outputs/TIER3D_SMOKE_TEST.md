# Tier 3D Sentiment + Endpoints — Smoke Test

Run mode: **offline (validators only)**
Generated at: 2026-06-05T01:11:10.377Z

## Battery 1 — /api/lab/temporal-distribution

| Case | Pass | Sum % | Total | Manual | Δ | Peak Label |
|---|---|---|---|---|---|---|
| ufos_aliens / hour | YES | 0 | 0 | — | — | (offline — endpoint not called) |
| ghosts_hauntings / month | YES | 0 | 0 | — | — | (offline — endpoint not called) |
| cryptids / decade | YES | 0 | 0 | — | — | (offline — endpoint not called) |
| psychic_phenomena / hour | YES | 0 | 0 | — | — | (offline — endpoint not called) |
| perception_sensory / month | YES | 0 | 0 | — | — | (offline — endpoint not called) |

**Battery 1 overall: PASS**

## Battery 2 — /api/lab/synthesized-paragraph

| Case | Pass | Chars | Reason if FAIL |
|---|---|---|---|
| Single UFO 1998 NC | YES | 46 | — |
| Three sleep-paralysis CA cluster | YES | 123 | — |
| Seven experiences, mixed | YES | 109 | — |
| Two cryptid encounters PNW | YES | 91 | — |
| Zero experiences | YES | 32 | — |
| Four psychic, one location | YES | 116 | — |
| Long historical span 1972-2022 | YES | 116 | — |
| Single perception event | YES | 53 | — |
| Five UFO sightings TX | YES | 109 | — |
| Two consciousness, daytime | YES | 119 | — |

### Sample outputs

- **Single UFO 1998 NC** — "A single 1998 UFO account anchors your record."
- **Three sleep-paralysis CA cluster** — "Your 3 submissions form a body of work between 2008 and 2014, including 3 consciousness accounts and 2 near santa cruz, ca."
- **Seven experiences, mixed** — "Your 7 submissions form a body of work between 2014 and 2021, including 4 UFO accounts and 4 near tucson, az."
- **Two cryptid encounters PNW** — "Your 2 submissions form a body of work between 2003 and 2009, including 2 cryptid accounts."
- **Zero experiences** — "No experiences are recorded yet."
- **Four psychic, one location** — "Your 4 submissions form a body of work between 2018 and 2019, including 3 psychic accounts and 4 near asheville, nc."
- **Long historical span 1972-2022** — "Your 3 submissions form a body of work between 1972 and 2022, including 3 apparition accounts and 2 near boston, ma."
- **Single perception event** — "A single 2024 perception account anchors your record."
- **Five UFO sightings TX** — "Your 5 submissions form a body of work between 2011 and 2022, including 5 UFO accounts and 4 near austin, tx."
- **Two consciousness, daytime** — "Your 2 submissions form a body of work between 2020 and 2021, including 2 consciousness accounts and 2 near sedona, az."

**Battery 2 overall: PASS**

## Overall

Tier 3D smoke test: **PASS**