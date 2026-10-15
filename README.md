# Resource Workspaces meeting room booking

Members book the meeting room from a public page with no account. Every booking
is a request the front desk confirms with one click from email. Overlaps are
impossible: Postgres refuses them at the storage layer. Free hours per tenant
are counted automatically; anything beyond is marked paid. Non-members can
request too, at the external rate.

Stack: Next.js 15 (App Router) on Vercel, Supabase Postgres, Resend for email.

## Pages

| Path | Who | What |
| --- | --- | --- |
| `/` | everyone | Booking page: date, free slots, duration, details, submit |
| `/schedule` | everyone | Month grid, "Booked" only (names are admin-only) |
| `/verify/<token>` | booker | Confirms their email on first use |
| `/cancel/<token>` | booker | Cancels their own booking (from the confirmation email) |
| `/act/<token>?do=confirm` | front desk | One-click Confirm or Reject from the request email |
| `/login` | front desk | Admin password |
| `/admin` | front desk | Excel-style month grid with names; click a cell |
| `/admin/requests` | front desk | Pending requests, confirm or reject |
| `/admin/people` | front desk | The register that builds itself |
| `/admin/tenants` | front desk | Contracts, free-hour overrides, hours used |
| `/admin/new` | front desk | Walk-in, block, or on-behalf booking |
| `/admin/settings` | front desk | Hours, rates, quotas, emails, switches |
| `/admin/export?month=YYYY-MM` | front desk | CSV (add `&format=grid` for the Excel-shaped one) |

## How identity works (no login)

Office (17, fixed) > Tenant (a contract; holds the free-hour quota) > Person
(a verified email). A new email's first booking sends them a verification
link and the front desk a "new booker" email. The admin links the person to a
tenant once (or creates the tenant). From then on their requests go straight
to the front desk. Nobody can book under an email they cannot read, and a
new email claiming a name already registered in that office is refused.

## Setup (once)

1. **Supabase**: create a project. Open SQL Editor, paste `supabase/schema.sql`,
   Run. Copy from Project Settings > API: the Project URL and the
   `service_role` key.
2. **Email**, one of:
   - Gmail: on the front-desk Google account turn on 2-step verification,
     create an App Password (myaccount.google.com/apppasswords), set
     `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Emails come from that address.
   - Resend: add and verify your sending domain (two DNS records), create an
     API key, set `RESEND_API_KEY` and `EMAIL_FROM`.
   With neither set, emails are printed to the server log instead of sent.
3. **Vercel**: import this repo. Add the environment variables from
   `.env.example`. Deploy. The cron in `vercel.json` runs daily on the Hobby
   plan; on Pro change it to `*/15 * * * *`.
4. Open `/login` with your `ADMIN_PASSWORD`, go to Settings, and set the room
   name, rates, front desk email and hours.

## Local development

```
cp .env.example .env.local   # fill in Supabase keys; leave RESEND_API_KEY empty
npm install
npm run dev
```

## Guarantees worth knowing

- `bookings_no_overlap` is a Postgres exclusion constraint over
  `(room_id, tstzrange(start_at, end_at))` for pending and confirmed rows.
  Two requests for the same slot in the same second: exactly one survives.
- Pending requests hold their slot. A request nobody decides on before its
  start time expires and frees the slot (checked on every admin page load and
  slot fetch, and by the daily cron).
- The service role key is used only in server code. Row Level Security is on
  with no policies, so the anon key can read nothing.
