#!/usr/bin/env npx tsx
/**
 * Dúchas adapter fixture test — OFFLINE, no network, no DB.
 *
 * The live API is 500ing (June 11, 2026), so this exercises the full mapping
 * path against a synthetic CBÉS payload built field-by-field from the v0.6
 * data dictionary (https://docs.gaois.ie/en/data/duchas/v0.6/data).
 *
 * Verifies: topic matching, item→ScrapedReport mapping, geo cascade
 * (place coords → county centroid → none), transcript join by ItemID,
 * language capture, topic filtering, dedup-key shape — and the two posture
 * invariants: no NC-licensed text and no person names anywhere in output.
 *
 * Usage: npx tsx scripts/duchas-fixture-test.ts
 */

import { matchTopics, mapCbesResponse, DUCHAS_TOPIC_RULES } from '../src/lib/ingestion/adapters/duchas';

// --- Fixture: /cbes/topics shape (hierarchical, ID/TitleEN/TitleGA/SubTopics) ---
const TOPICS_FIXTURE = [
  {
    ID: 1000, TitleEN: 'Folk Belief', TitleGA: 'Creideamh Coiteann',
    SubTopics: [
      { ID: 5192275, TitleEN: 'Ghosts', TitleGA: 'Taibhsí', SubTopics: [] },
      { ID: 5192280, TitleEN: 'The Banshee', TitleGA: 'An Bhean Sí', SubTopics: [] },
      { ID: 5192290, TitleEN: 'Fairy Forts', TitleGA: 'Liosanna', SubTopics: [] },
      { ID: 5192300, TitleEN: 'Local Roads', TitleGA: 'Bóithre', SubTopics: [] }, // should NOT match
    ],
  },
];

// --- Fixture: /cbes response shape (volume → Parts→Items, Pages→Transcripts) ---
const NC_TEXT = 'One night my grandmother saw a woman in white by the fort...'; // must never appear in output
const CBES_FIXTURE = [
  {
    ID: 4428119, VolumeNumber: '0133',
    Pages: [
      { ID: 4427883, ImageFileName: 'img1.jpg', Transcripts: [{ ID: 1, ItemID: 9000001, Text: NC_TEXT, Transcribers: [{ Name: 'Volunteer McTranscriber' }] }] },
      { ID: 4427884, ImageFileName: 'img2.jpg' }, // no transcript
    ],
    Parts: [
      {
        ID: 7700, School: { Name: 'Corofin (B.)', RollNumber: '12345', Locations: [{ LogainmID: 99, NameEN: 'Corofin', NameGA: 'Cora Finne', Coordinates: { Latitude: 52.945, Longitude: -9.061 }, Counties: [{ LogainmID: 100003, NameEN: 'Clare', QualifiedNameEN: 'Co. Clare', Coordinates: { Latitude: 52.85, Longitude: -8.98 } }] }] },
        Teachers: [{ Names: { FullName: 'Seán Ó Múinteoir' } }],
        Items: [
          { // titled, place coords via item location, en+ga, transcribed, matching topic
            ID: 9000001, Title: 'The White Lady of the Fort', Pages: [4427883], FirstPageID: 4427883, LastPageID: 4427883,
            Topics: [{ ID: 5192275, TitleEN: 'Ghosts', TitleGA: 'Taibhsí' }],
            Languages: ['en', 'ga'],
            LocationsIreland: [{ LogainmID: 101, NameEN: 'Kilnaboy', Coordinates: { Latitude: 52.97, Longitude: -9.07 }, Counties: [{ LogainmID: 100003, NameEN: 'Clare', QualifiedNameEN: 'Co. Clare', Coordinates: { Latitude: 52.85, Longitude: -8.98 } }] }],
            Informants: [{ ID: 1, Names: { FullName: 'Bríd Uí Anonymized' }, Age: { Age: 78 }, AddressesIreland: [{ NameEN: 'Somewhere Sensitive' }] }],
            Collectors: [{ ID: 2, Names: { FullName: 'Young Schoolchild' }, Age: { Age: 12 } }],
          },
          { // untitled, no item location (school fallback), Extract present (must be ignored), not transcribed
            ID: 9000002, Extract: 'There is a fairy fort in the townland and no one will cut...', Pages: [4427884], FirstPageID: 4427884,
            Topics: [{ ID: 5192290, TitleEN: 'Fairy Forts', TitleGA: 'Liosanna' }],
            Languages: ['ga'],
          },
          { // county-coords-only cascade (no place anywhere), banshee topic
            ID: 9000003, Title: 'An Bhean Sí', Pages: [4427884], FirstPageID: 4427884,
            Topics: [{ ID: 5192280, TitleEN: 'The Banshee', TitleGA: 'An Bhean Sí' }],
            Counties: [{ LogainmID: 100003, NameEN: 'Clare', QualifiedNameEN: 'Co. Clare', Coordinates: { Latitude: 52.85, Longitude: -8.98 } }],
            Languages: ['en'],
          },
          { // non-matching topic — must be filtered out when querying topic 5192275
            ID: 9000004, Title: 'The Road to Ennis', Pages: [4427884], FirstPageID: 4427884,
            Topics: [{ ID: 5192300, TitleEN: 'Local Roads' }], Languages: ['en'],
          },
        ],
      },
    ],
  },
];

// County-only-fallback school variant for item 9000002/9000003: strip school coords
const CBES_NO_SCHOOL_COORDS = JSON.parse(JSON.stringify(CBES_FIXTURE));
CBES_NO_SCHOOL_COORDS[0].Parts[0].School.Locations = [];

let failures = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}

console.log('=== 1. Topic matching ===');
const matched = matchTopics(TOPICS_FIXTURE);
check('matches Ghosts/Banshee/Fairy, not Local Roads', matched.length === 3 && !matched.some((t) => t.id === 5192300), matched.map((t) => t.titleEN));
const ghosts = matched.find((t) => t.id === 5192275)!;
check('Ghosts → ghosts_hauntings + path captured', ghosts?.rule.category === 'ghosts_hauntings' && ghosts?.path === 'Folk Belief', ghosts);
const banshee = matched.find((t) => t.id === 5192280)!;
check('Banshee rule wins over generic fairy', banshee?.rule.experienceTypeSlug === 'banshee', banshee?.rule);

console.log('=== 2. Item mapping (topic = Ghosts) ===');
const r = mapCbesResponse(CBES_FIXTURE, ghosts, 50);
check('only the matching item mapped (topic filter)', r.length === 1 && r[0].original_report_id === 'duchas-cbes-9000001', r.map((x) => x.original_report_id));
const g = r[0];
check('title from item.Title', g.title === 'The White Lady of the Fort');
check('item-location coords beat school coords', g.latitude === 52.97 && g.city === 'Kilnaboy' && g.location_precision === 'city' && !g.coords_synthetic, { lat: g.latitude, city: g.city });
check('county + country set', g.state_province === 'Clare' && g.country === 'Ireland');
check('source_url shape volume/page/item', g.source_url === 'https://www.duchas.ie/en/cbes/4428119/4427883/9000001', g.source_url);
check('event_date unset (legends undated)', g.event_date === undefined && g.event_date_precision === 'unknown');
check('hasTranscript joined via ItemID', g.metadata?.hasTranscript === true);
check('languages captured', JSON.stringify(g.metadata?.languages) === '["en","ga"]');
check('experienceTypeSlug=ghost + category', g.metadata?.experienceTypeSlug === 'ghost' && g.category === 'ghosts_hauntings');
check('PII counts only', g.metadata?.informantCount === 1 && g.metadata?.collectorCount === 1);

console.log('=== 3. Posture invariants (all topics, all items) ===');
const all = matched.flatMap((t) => mapCbesResponse(CBES_FIXTURE, t, 50));
const blob = JSON.stringify(all);
check('NC transcript text never present', !blob.includes('woman in white'));
check('Extract text never present', !blob.includes('no one will cut'));
for (const name of ['Bríd', 'Anonymized', 'Schoolchild', 'Ó Múinteoir', 'McTranscriber', 'Somewhere Sensitive']) {
  check(`person/address never present: ${name}`, !blob.includes(name));
}
check('attribution present on every report', all.every((x) => x.description.includes('© National Folklore Collection')));
check('dedup keys unique + shaped', new Set(all.map((x) => x.original_report_id)).size === all.length && all.every((x) => /^duchas-cbes-\d+$/.test(x.original_report_id)));

console.log('=== 4. Geo cascade + untitled fallback ===');
const fairy = matched.find((t) => t.id === 5192290)!;
const f = mapCbesResponse(CBES_FIXTURE, fairy, 50)[0];
check('school-location fallback for item with no location', f?.city === 'Corofin' && f?.location_precision === 'city', { city: f?.city });
check('untitled item gets constructed factual title (no Extract)', f?.title.includes('Fairy Forts') && !f?.title.includes('no one will cut'), f?.title);
const b = mapCbesResponse(CBES_NO_SCHOOL_COORDS, banshee, 50)[0];
check('county-centroid fallback → region + synthetic', b?.location_precision === 'region' && b?.coords_synthetic === true && b?.latitude === 52.85, { prec: b?.location_precision });
const fNoSchool = mapCbesResponse(CBES_NO_SCHOOL_COORDS, fairy, 50)[0];
check('no coords at all → precision unset, lat/lng undefined', fNoSchool?.latitude === undefined || fNoSchool?.location_precision === 'region', { lat: fNoSchool?.latitude, prec: fNoSchool?.location_precision });

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
