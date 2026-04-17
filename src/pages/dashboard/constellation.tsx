/**
 * Legacy constellation route — now redirects to /lab?tab=map.
 *
 * The live constellation map surface moved into the Lab as part of Session A1
 * (UX consolidation). Existing bookmarks, share links, and internal references
 * to /dashboard/constellation continue to work via this server-side redirect.
 *
 * Shared types that used to live in this file are now in:
 *   src/lib/constellation-types.ts
 */

import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/lab?tab=map',
      permanent: false,
    },
  }
}

// The component is never rendered because of the redirect above, but Next.js
// requires a default export for page files.
export default function ConstellationRedirect() {
  return null
}
