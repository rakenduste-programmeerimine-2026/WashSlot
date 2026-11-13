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

3. Copy `.env.example` to `.env.local` and fill in those two values. The Brevo values are optional locally. Without them, cycle-end emails are printed to the server log instead of sent.

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

Integration tests call the API routes against local Supabase, so start it first:

```
npm run test:integration
```

## API

All endpoints are under `/api` and use JSON. Every endpoint needs a signed-in user.

- **From the app:** call them with `fetch`. The login cookie is sent automatically.
- **From Postman or curl:** send `Authorization: Bearer <access token>`. See "Getting a token" below.
- **Request bodies:** send `Content-Type: application/json`, or the request is rejected with `415`.

On success, the response body is the data shown below. On failure, it's `{ "error": "message" }`, and the message is safe to show to users.

| Status | Meaning |
| --- | --- |
| `200` / `201` | Success (`201` when something was created) |
| `400` | Invalid input |
| `401` | Not logged in |
| `403` | Not allowed, such as a resident calling an admin endpoint |
| `404` | Not found, or not yours |
| `409` | Conflict, such as "Machine is already in use" or "Slot is already booked" |
| `415` | Body isn't JSON |
| `500` | Unexpected error |

### Me

**`GET /api/me`**: the current user's building and admin flag.

```json
{
  "isAdmin": false,
  "building": { "id": "uuid", "name": "Demo Dormitory", "timezone": "Europe/Tallinn" }
}
```

`building` is `null` until the user joins one. Show times in `building.timezone`.

### Machines

**`GET /api/machines`**: every machine in the user's building with its live status, sorted by label.

```json
[
  {
    "machine_id": "uuid",
    "label": "Washer 1",
    "type": "washer",
    "default_cycle_minutes": 60,
    "state": "in_use",
    "current_cycle_id": "uuid",
    "current_user_id": "uuid",
    "cycle_started_at": "2026-11-08T10:00:00+00:00",
    "estimated_finish_at": "2026-11-08T11:00:00+00:00",
    "next_booking_id": null,
    "next_booking_user_id": null,
    "next_booking_starts_at": null,
    "next_booking_ends_at": null
  }
]
```

`state` is one of:

| State | Meaning |
| --- | --- |
| `free` | Available |
| `in_use` | A cycle is running, with `estimated_finish_at` set |
| `awaiting_collection` | Finished, and the owner has 15 minutes to collect |
| `reserved` | A booking is active right now |
| `out_of_order` | An admin flagged it as broken |

A machine can change state with no database change, for example when a cycle's finish time passes, so re-fetch when `estimated_finish_at` is reached.

**`POST /api/machines`** (admin): add a machine. Returns the machine with `201`.

```json
{ "label": "Washer 6", "type": "washer", "defaultCycleMinutes": 45 }
```

- `label`: 1–30 characters, unique in the building.
- `type`: `"washer"` or `"dryer"`.
- `defaultCycleMinutes`: whole number from 5 to 240.

**`PATCH /api/machines/:id`** (admin): change any of `label`, `type`, `defaultCycleMinutes` and `outOfOrder`. Send only the fields you're changing. Returns the updated machine.

```json
{ "outOfOrder": true }
```

### Cycles

**`POST /api/cycles`**: start a machine. Returns the cycle with `201`.

```json
{ "machineId": "uuid", "minutes": 30 }
```

The owner gets a "started" email straight away, with the finish time, and a "done" email at the finish time asking them to collect their laundry. Leave out `minutes` to use the machine's default length. Otherwise it must be a whole number from 5 to 240. The request fails with `409` if the machine is busy, out of order, or booked by another resident. Starting during your own booking uses that booking.

**`POST /api/cycles/:id/release`**: mark your own cycle collected, or cancel it. Returns the cycle.

```json
{ "reason": "collected" }
```

`reason` is `"collected"` or `"cancelled"`. Either way, the pending "done" email is cancelled. Cancelling also sends a "cancelled" email, while collecting sends nothing. Other users' cycles return `404`.

### Bookings

**`GET /api/bookings`**: your bookings that haven't ended yet, soonest first.

```json
[
  {
    "id": "uuid",
    "machine_id": "uuid",
    "user_id": "uuid",
    "starts_at": "2026-11-08T15:00:00+00:00",
    "ends_at": "2026-11-08T16:00:00+00:00",
    "status": "booked",
    "created_at": "2026-11-08T10:00:00+00:00"
  }
]
```

**`POST /api/bookings`**: book a slot. Returns the booking with `201`.

```json
{ "machineId": "uuid", "startsAt": "2026-11-08T15:00:00Z", "endsAt": "2026-11-08T16:00:00Z" }
```

A booking must start in the future, at most 24 hours ahead, and last 15 minutes to 4 hours. Each resident can have 2 upcoming bookings. Overlapping slots and slots during a running cycle return `409`.

**`DELETE /api/bookings/:id`**: cancel your own upcoming booking. Returns the booking.

### Joining a building

Joining isn't an API endpoint yet. The `/join` page uses the `joinBuilding` Server Action in `app/join/actions.ts`.

### Getting a token

For Postman or curl against local Supabase, get your publishable key from `npx supabase status`, then sign in with a user you created in the app:

```powershell
$key = "YOUR_PUBLISHABLE_KEY"
$login = Invoke-RestMethod -Method Post "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -Headers @{ apikey = $key } -ContentType "application/json" -Body '{"email":"you@example.com","password":"your-password"}'
$h = @{ Authorization = "Bearer $($login.access_token)" }

Invoke-RestMethod http://localhost:3000/api/machines -Headers $h
Invoke-RestMethod -Method Post http://localhost:3000/api/cycles -Headers $h -ContentType "application/json" -Body '{"machineId":"PASTE_ID","minutes":30}'
```

Tokens expire after an hour. Sign in again to get a new one.
