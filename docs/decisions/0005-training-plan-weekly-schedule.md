# 0005: Training plans keep the weekday on each plan item; progress is read from the logs

Status: accepted (M1 training plans slice)

**Context.** A training plan is a weekly schedule: squats on Monday, 50 shots on Wednesday. It must work offline, stay sync-ready, and show "how far am I today" without a second copy of the truth. The data-model sketch listed three tables: `training_plan`, `plan_day`, `plan_item`.

**Decision.**
- Two tables, `training_plan` and `plan_item`. Each item carries its own `weekday` (ISO: 1 = Monday ... 7 = Sunday), so there is no `plan_day` table. A rest day is a weekday with no items.
- An item is either an exercise (the exercise, target sets, and the targets that fit its measurement type, in metric units) or a shooting item (target shots). A CHECK constraint keeps every row to one of the two shapes.
- A plan holds an exercise at most once per weekday and at most one shooting item per weekday (partial unique indexes), so the progress of an item is never ambiguous.
- The database allows at most one active plan (partial unique index). The first plan created becomes active; switching the active plan is one transaction. Home shows today's items of the active plan.
- Progress is never stored. Today's progress counts the sets of the item's exercise, or the resolved shots, logged between local midnight and the next local midnight (`setsBetween` / `shotsBetween`, bounds converted to UTC ISO strings). Editing or deleting a log therefore corrects the plan with no extra bookkeeping.
- Removing an item or deleting a plan is a soft delete. Logged sets and shots are never touched. An item whose custom exercise was deleted is hidden from the plan.

**Trade-offs.** Fewer tables and no empty "day" rows to keep in sync. The cost is that a day has no attributes of its own (a name like "Leg day", notes). If that is wanted later, a `plan_day` table can be added by a new migration without moving any item, because items already know their weekday. Counting every logged set of the exercise that day, wherever it was started, is simple and forgiving, but it cannot tell planned sets from extra ones.

**Consequences.** `docs/TECHNICAL_ARCHITECTURE.md` section 4 lists the two tables. Weekday names are translated in the UI; the database holds only the number. A day means the player's local calendar day, so travelling to another time zone shifts what counts as "today" (stored logs are not rewritten).
