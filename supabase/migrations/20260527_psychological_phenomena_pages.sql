-- V11.17.39 (#107) — content for the 3 new psychological_experiences
-- phenomenon pages.
--
-- Companion to 20260527_psychological_phenomena_expansion.sql which
-- added rows to phenomenon_types (taxonomy table). This migration
-- creates the corresponding rows in phenomena (page-rendering table)
-- with ai_summary / ai_description / display_blurb / feed_hook so the
-- /phenomena/<slug> pages don't render empty when the classifier
-- starts linking reports to them.
--
-- Also: aligns synchronicity's category between the two tables.
-- phenomenon_types put it in psychological_experiences (its conceptual
-- home — it's about meaningful internal-state↔external-event linkage),
-- but the existing phenomena row had it in psychic_phenomena. We move
-- the phenomena row to match.

-- 1) Align synchronicity category.
UPDATE public.phenomena
SET category = 'psychological_experiences'
WHERE slug = 'synchronicity'
  AND category = 'psychic_phenomena';

-- 2) Insert phenomena rows for the 2 brand-new phenomenon types.
--    The 'auto_generated' flag is true so admins can re-flag for human
--    review later if needed. ai_model_used identifies this batch.

INSERT INTO public.phenomena (
  slug, name, category, aliases, ai_summary, ai_description,
  display_blurb, feed_hook, ai_model_used, ai_generated_at,
  status, auto_generated, report_count, created_at, updated_at
)
VALUES
  (
    'manifestation-experience',
    'Manifestation Experience',
    'psychological_experiences',
    ARRAY['manifestation', 'law of attraction', 'thought into reality', 'intentional creation']::TEXT[],
    'Manifestation describes reports in which a witness intentionally focuses on a specific outcome — through thought, visualization, written intention, or spoken word — and subsequently experiences that outcome unfolding in physical reality in a way they interpret as causally connected rather than coincidental.',
    'Manifestation is the practice — and the reported result — of bringing a specific intended outcome into physical reality through focused thought, visualization, or spoken/written intent. Across spiritual traditions, self-help frameworks, and personal anomalous experience reports, witnesses describe holding a clear specific desire (an encounter, an opportunity, an object) and watching it materialize in waking life with timing or specificity that feels beyond chance. Practitioners distinguish manifestation from prayer (which addresses a higher power) and from synchronicity (which is read, not generated). The phenomenon overlaps with the secular "law of attraction" framing, the religious notion of efficacious prayer, and the parapsychological category of micro-psychokinesis. Skeptical accounts attribute the experience to confirmation bias, selection effects in memory, and unconscious behavioral shifts that bring the intended outcome closer. Witness accounts describe an experiential quality that resists those explanations: highly specific outcomes, short time windows, and details the witness had no behavioral path to influence.',
    'A specific intention, held with focus, followed by a corresponding physical event in a way the witness reads as causal rather than coincidental.',
    'A witness holds a specific intention or thought, then watches it unfold in reality in ways they cannot attribute to coincidence.',
    'claude-haiku-curated',
    NOW(),
    'active',
    true,
    0,
    NOW(),
    NOW()
  ),
  (
    'vanishing-object',
    'Vanishing or Appearing Object',
    'psychological_experiences',
    ARRAY['apport', 'asport', 'object teleportation', 'appearing object', 'reappearing object', 'object materialization']::TEXT[],
    'Vanishing-or-appearing-object reports describe a physical object that disappears from a known location and/or appears in a location where it could not have arrived by ordinary means — sometimes the same object returning to the witness after extended absence, sometimes an unfamiliar object materializing with no plausible source.',
    'Reports of vanishing or appearing objects span a long history in paranormal literature, where the appearance of an object with no plausible source is known as an "apport" and its disappearance an "asport." Witnesses describe placing or knowing the location of an object — keys, jewelry, a wallet, a tool — and watching it vanish despite the room being closed, observed, or otherwise impossible for routine displacement. Conversely, witnesses report objects appearing at their doorstep, on a bedside table, or in a sealed drawer with no recollection of placing them and with personal or symbolic significance that makes mere mistake feel insufficient. Some traditions associate apports with mediumship and séance work; modern personal accounts more often describe them in the context of grief (an object belonging to a deceased loved one reappearing), thought-saturation (an object the witness recently obsessed over materializing), or no apparent context at all. Skeptical explanations include misremembered placement, household members not consulted, and the cognitive reconstruction of vivid surprise into causally-impossible narrative.',
    'A physical object disappears from one location, appears in another, or returns to the witness in a way that defies normal handling.',
    'Witnesses report objects vanishing, reappearing, or arriving with no plausible path of physical transit.',
    'claude-haiku-curated',
    NOW(),
    'active',
    true,
    0,
    NOW(),
    NOW()
  )
ON CONFLICT (slug) DO NOTHING;
