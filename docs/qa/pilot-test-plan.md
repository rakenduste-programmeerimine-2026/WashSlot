# WashSlot – Pilot Test Plan

Owner: Database & QA · Milestone: **M5 Pilot & QA**

## 1. Goal

Validate the agreed success criterion with real residents:

> The contact and at least 3 other residents use the prototype for 2 weeks. During that time the contact
> **never finds all machines unexpectedly busy**, and **collects their laundry within 10 minutes** of the cycle ending.

## 2. Participants

| Role | Count | Notes |
| --- | --- | --- |
| Contact (primary user) | 1 | Does laundry 2–3×/week, found all machines busy ~50 % of the time |
| Other residents of the same building | ≥ 3 | Needed so the overview reflects real machine use |
| QA facilitator | 1 | Onboarding, daily check of metrics, bug triage |

## 3. Entry criteria (before day 1)

- [ ] All M2–M4 issues closed; CI green on `main`
- [ ] Hosted Supabase project has all migrations applied; real building + machines entered
- [ ] Push notifications verified on each participant's phone (test cycle of 5 min)
- [ ] No open **blocker** bugs
- [ ] Participants signed up and joined the building with its code

## 4. Schedule

| Day | Activity |
| --- | --- |
| 0 | Onboarding (10 min each): install / add to home screen, sign up, join building, enable notifications, do a test cycle |
| 1–14 | Normal use. Residents start every wash/dry in the app and tap **Collected** when they take laundry out |
| 3, 7, 10 | 2-minute check-in with the contact (diary review, problems) |
| 14 | Exit interview with all participants, export metrics, write the [pilot report](https://github.com/rakenduste-programmeerimine-2026/WashSlot/issues/12) |

## 5. Measuring the success criterion

### 5.1 Collection within 10 minutes (automatic)

Each cycle the contact starts in the app records `ends_at`; tapping **Collected** records `released_at`.

```sql
-- run in the Supabase SQL editor (service role); replace the user id
select count(*)                                              as cycles,
       count(*) filter (where collected_within_10_min)       as on_time,
       count(*) filter (where collected_within_10_min = false) as late,
       count(*) filter (where collected_at is null)          as not_marked,
       round(avg(minutes_after_end), 1)                      as avg_minutes_after_end
from public.cycle_collection_stats
where user_id = '<contact user id>';
```

**Pass:** `late = 0`. Cycles with `not_marked` are followed up in the check-ins (forgot to tap vs. forgot laundry).

### 5.2 "All machines unexpectedly busy" (diary)

Not measurable from data alone, because "unexpectedly" means the app said otherwise. The contact logs every trip to the
laundry room in a short diary (shared note or form):

| Date/time | Checked app first? | What the app showed | What I found | Unexpected? |
| --- | --- | --- | --- | --- |

**Pass:** zero rows where *Unexpected = yes*. Every such row is also filed as a bug (label `bug`, `pilot`).

### 5.3 Adoption (automatic, supporting)

```sql
select p.display_name, count(c.*) as cycles
from public.profiles p left join public.cycles c on c.user_id = p.id
group by p.display_name order by cycles desc;
```

**Pass:** contact + ≥ 3 others each start at least one cycle per week of the pilot.

## 6. Bug reporting during the pilot

- Participants message the QA facilitator (chat is fine); the facilitator files a GitHub issue with label `bug` + `pilot`
  using the template in the [test strategy](test-strategy.md#6-bug-reports).
- **Blocker** bugs are fixed within 24 h; the fix is announced to participants.
- A day with a blocker that made the app unusable is noted in the report and may extend the pilot.

## 7. Exit criteria

- 14 days completed (excluding blocker downtime)
- Metrics from §5 exported and attached to the pilot report
- All `pilot` bugs triaged
