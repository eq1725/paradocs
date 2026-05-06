# Push Notifications Setup (V9.4)

The push delivery infrastructure is in place. To turn on actual notifications, do the following one-time setup.

## 1. Generate VAPID keys

VAPID (Voluntary Application Server Identification) is the browser-standard auth scheme for Web Push. You need a public/private key pair — the public key is exposed to the client, the private key signs each push. Generate with `web-push`:

```bash
npx web-push generate-vapid-keys
```

You'll get something like:
```
=======================================
Public Key:
BLk9...zX8p
Private Key:
abcd1234...
=======================================
```

## 2. Set environment variables in Vercel

In Vercel → Project → Settings → Environment Variables, add:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = the public key (exposed to client)
- `VAPID_PRIVATE_KEY` = the private key (server only)
- `VAPID_SUBJECT` = `mailto:williamschaseh@gmail.com` (or your contact email — required by spec)
- `CRON_SECRET` = a random 32-character string (Vercel cron auth header)

Make sure `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is also set in your local `.env.local` so dev builds work.

Redeploy after adding so the env vars apply.

## 3. Apply the migration

In Supabase SQL Editor:

```sql
-- 20260505_push_subscriptions.sql contents already in repo
ALTER TABLE phenomena ...   -- if not yet applied
```

Or just `supabase db push` if linked.

## 4. Cron jobs are already in vercel.json

Two crons run daily:

- **05:00 UTC** — `/api/admin/leads/select-today` picks Today's Lead phenomenon based on the heuristic. Editorial-locked rows are preserved.
- **13:00 UTC (8 AM EST)** — `/api/push/send-daily-lead` reads the lead, fetches its `push_copy`, and pushes to all active subscribers on the `daily_lead` topic.

Adjust the schedules in `vercel.json` if you want a different send time. (Current 13:00 UTC = 8 AM Eastern, 5 AM Pacific — sweet-spot morning ritual time for US users.)

Vercel cron will call these endpoints with `Authorization: Bearer ${CRON_SECRET}` header — the endpoints check that against the `CRON_SECRET` env var to authorize.

## 5. Wire the opt-in UI (manual integration)

The subscription helpers are in `src/lib/pushNotifications.ts`. To add an opt-in button anywhere (Profile, Settings, an in-feed prompt, etc.):

```tsx
import { requestPushSubscription, isPushSupported, getPushPermissionState } from '@/lib/pushNotifications'

function NotificationToggle() {
  const [state, setState] = useState<'idle' | 'pending' | 'on' | 'denied'>('idle')

  if (!isPushSupported()) return null
  if (getPushPermissionState() === 'granted') return <span>Notifications enabled</span>

  return (
    <button
      onClick={async () => {
        setState('pending')
        const result = await requestPushSubscription()
        if (result.subscribed) setState('on')
        else if (result.denied) setState('denied')
        else setState('idle')
      }}
    >
      Enable daily notifications
    </button>
  )
}
```

For PWA on iOS: notifications only work in **standalone mode** (added to home screen). In Safari browser they don't work yet.

## 6. Test the send manually

Once VAPID keys are set and a subscription exists in `push_subscriptions`:

```bash
curl -sX POST "https://beta.discoverparadocs.com/api/push/send-daily-lead" \
  -H "x-admin-key: $ADMIN_API_KEY" | jq .
```

Should return `{ sent, failed, disabled, total }`. Watch for the notification on the device that subscribed.

## 7. Pick today's lead manually if needed

```bash
curl -sX POST "https://beta.discoverparadocs.com/api/admin/leads/select-today" \
  -H "x-admin-key: $ADMIN_API_KEY" | jq .
```

Returns the winning phenomenon + score breakdown. To override editorially, set `editorial_locked = true` directly in the `daily_leads` table after selecting your preferred phenomenon.

## What's still TODO

- **Opt-in UI integration** — drop the `NotificationToggle` somewhere visible (Profile page, Settings, contextual prompt after first save). The helper is ready; just needs a UI surface.
- **Anon → user claim** — when an anonymous subscriber signs in, the bootstrap flow could re-attribute their `push_subscriptions` rows by anon_client_id → user_id.
- **Per-topic preferences** — currently everyone is on `['daily_lead']`. Add UI for opting into category-specific topics (e.g., `cryptids_only`).
- **Unsubscribe endpoint** — `/api/push/unsubscribe` for explicit server-side removal (currently relies on dead-endpoint cleanup via 410 responses).
- **Activity-aware cooldown** — don't send if user opened the app in the last 4 hours.

These are all incremental — the core delivery loop is complete.
