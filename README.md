# WashSlot

A web app for residents who share a laundry room. It shows which machines are free, lets residents start a timed cycle, and lets them book a slot later today.

**Problem:** Residents walk down to find every machine taken, or find their laundry pulled out because they collected it late. The paper sign-up sheet goes unused.

**Scope:** live machine overview, starting a cycle, and booking a slot, for one laundry room. Admins manage machines and create residents' accounts, so there is no public signup.

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

4. Start the app at http://localhost:3000:

   ```
   npm run dev
   ```

For a hosted Supabase project, turn off new user signups in its Auth settings. The app has no signup page, but that setting is what actually blocks signups.

## Checks

```
npm run lint
npm test
npm run build
```
