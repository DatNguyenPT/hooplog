# 0004: Built-in exercises are seeded by migration, named by translation key

Status: accepted (M1 workout logging slice)

**Context.** The exercise library ships with about 20 basketball-relevant exercises, must work offline from first launch, be translatable (Vietnamese later) and stay sync-ready next to user-created exercises.

**Decision.**
- Built-ins are inserted by migration v3 with fixed, hand-assigned UUIDs (`00000000-0000-4000-8000-0000000000NN`) and `is_builtin = 1`. Adding or changing built-ins later is a new migration (`INSERT OR IGNORE` / `UPDATE`), never an edit of v3.
- A built-in's `name` column stores a translation key suffix (`squat`), shown via `exercises.builtin.<name>`. Custom exercises store the typed name and `is_builtin = 0`. Translating a built-in therefore needs only a locale file, not a data change.
- Search filters on the displayed (translated) name in the domain layer (`filterExercises`), not in SQL, because SQL cannot see translations. The library is small, so filtering in memory is cheap.
- Only custom exercises can be soft-deleted. Past sets keep resolving the name of a deleted exercise (history is never rewritten).

**Trade-offs.** Fixed ids mean every device agrees on built-in identity, which keeps future sync simple (no duplicate "Squat" rows). The cost is that built-ins are code-owned: a typo in a seed needs a corrective migration. Keeping the key in `name` avoids an extra column but means `name` is only meaningful together with `is_builtin`.

**Consequences.** Never reuse or renumber a built-in id. A new locale must provide every `exercises.builtin.*` key.
