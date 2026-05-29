'use client'

/**
 * LabMark — V11.17.42
 *
 * Single ◇ glyph in cream-tinted gray that reads as "this person is
 * a Lab subscriber." Renders inline next to a username anywhere
 * we attribute (header, comments, /lab tabs).
 *
 * Per panel memo (docs/BADGE_SYSTEM_PANEL.md section 4.6): Lab is
 * a subscription state, not a tier. The diamond is a separate lane
 * from the Standing pills — Archivists who are also Lab subscribers
 * get both.
 *
 * SWC compat: var + function() form.
 */

import React from 'react'

interface LabMarkProps {
  /** Show only when true; component returns null otherwise so callers
   * can drop it unconditionally into their JSX. */
  show: boolean
  /** Title attribute for the small hover tooltip. */
  title?: string
  /** Optional extra classes for spacing on a per-surface basis. */
  className?: string
}

export function LabMark(props: LabMarkProps) {
  if (!props.show) return null
  return (
    <span
      aria-label="Lab subscriber"
      title={props.title || 'Lab subscriber'}
      className={'inline-block align-baseline text-[10px] leading-none text-[#f2ead8]/70 ' + (props.className || '')}
      style={{ marginLeft: '0.35em' }}
    >
      ◇
    </span>
  )
}

export default LabMark
