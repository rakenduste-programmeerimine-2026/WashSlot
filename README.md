# WashSlot

A web app for residents who share a laundry room. It shows which machines are free, lets residents start a timed cycle, and lets them book a slot later today.

**Problem:** Residents walk down to find every machine taken, or find their laundry pulled out because they collected it late. The paper sign-up sheet goes unused.

**Scope:** live machine overview, starting a cycle, and booking a slot, for one laundry room. Residents sign up and join their building with its code. Building admins manage machines.

**Success criterion:** The contact and at least 3 other residents use the prototype for 2 weeks. The contact never finds all machines unexpectedly busy and collects their laundry within 10 minutes of the cycle ending.

Built with TypeScript, Next.js, Supabase and Vercel.

## Setup

You need Node.js 22 and, for local Supabase, Docker Desktop.

1. Install dependencies:

   ```
   npm install
   ```

2. Start local Supabase. It prints the API URL and publishable key:

   ```
   npx supabase start
   ```

3. Copy `.env.example` to `.env.local` and fill in those two values.

4. Load the database tables and demo data. This wipes your local Supabase data:

   ```
   npx supabase db reset
   ```

5. Start the app at http://localhost:3000:

   ```
   npm run dev
   ```

6. Sign up in the app, then join the demo building with the code `DEMO2026`.

For a hosted Supabase project, turn off email confirmation in its Auth settings.

## Checks

```
npm run lint
npm test
npm run build
```
