# 0010: Back up, restore and delete data on the phone (one JSON file)

Status: proposed (M1 slice 6, ROADMAP item 6). Waiting for the owner's review.

**Context.** Everything a player logs lives only in the phone's SQLite database ([0001](0001-local-first-data.md)). An account does not back anything up yet ([0008](0008-optional-accounts-supabase-auth.md)), so a lost or replaced phone loses the history. Until sync exists, a file the player keeps themselves is the only safety net. Players also need a way to remove all of their data.

**Decision.**
- One JSON file: `{ "app": "hooplog", "format": 1, "exported_at": ..., "data": { profile, exercise, shooting_session, shot, workout_session, workout_set, training_plan, plan_item } }`. Names and columns are the database's own, so a row in the file is a row in the table and lines up with the cloud schema ([0009](0009-cloud-schema.md)). Only live rows are written (`deleted_at` is null). Built-in exercises are not written: they ship with the app under fixed ids, so only custom ones travel.
- Every file is checked with strict Zod schemas and for rows that point at missing parents, before the database is touched. A file from a newer app (`format` above 1) is refused with a message to update. A change that older apps could not read bumps `format`; adding an optional field does not.
- Restore replaces everything, in one transaction. Merging two histories needs conflict rules, which arrive with sync (M4). Until then restore means "put this file's data on this phone and discard what is there". The confirmation shows what the file holds and what would be replaced, and tells the player to export first. The saved name is replaced only if the file has one. If anything fails, the transaction rolls back and the phone is unchanged.
- Delete all removes every logged row, custom exercises and the saved name, in one transaction, then asks SQLite to `VACUUM` so deleted rows are not left in the file (best effort). Built-in exercises stay. The app then returns to Welcome as on first launch. A signed-in account is not touched; deleting it is its own action ([0008](0008-optional-accounts-supabase-auth.md)).
- Restore and delete-all remove rows for real instead of setting `deleted_at`. Once sync exists, a hard delete cannot reach the cloud copy, so that slice must turn these into tombstones or make "delete everything" clear the cloud copy as well.
- Files are made and read in the app's cache folder. The share sheet takes the export from there. Earlier exports are removed at the next export and after delete-all, and the copy the file picker makes is removed once read (a file outside the cache is never deleted). Files over 50 MiB are refused on import, before they are read into memory, since a JSON file is parsed whole.
- Three new dependencies, added with `npx expo install` at the SDK 58 versions: `expo-file-system`, `expo-sharing` and `expo-document-picker`. All three are MIT, maintained by Expo, work in Expo Go and need no config plugin (the `expo-sharing` plugin only lets the app receive shared files, which we do not). Alternatives rejected: React Native's own `Share` sends text, not a file, and Android limits how much text a share can carry; saving straight to shared storage would be Android-only code outside a platform adapter.

**Trade-offs.**
- The file is plain, unencrypted JSON. Anyone who has the file can read it, and the screen says so. A password-protected backup can be added if players ask.
- The app cannot tell whether the player finished saving from the share sheet. The message after export therefore says a backup was created, and to export again if the sheet was closed without saving.
- Replace-all can overwrite newer data with an older file. The confirmation with counts and the export-first reminder are the guard.
- The size limit is applied on import only. A shot is about 270 bytes in the file, so reaching 50 MiB takes roughly 190,000 shots. If anyone gets near that, export should refuse earlier or the format should stream.
- The picker's cache copy briefly doubles the file on disk; at the size limit that is acceptable.

**Consequences.** New `src/features/my-data/{domain,data,ui}` and a "Your data" screen reached from Settings. The Stack line in `CLAUDE.md` gains these three Expo packages when this is accepted. M4 sync has to revisit hard deletes and replace-all (see above). Text goes through new `data.*` translation keys. Open device checks: how the share sheet reports being closed, and that files from common providers (Drive, Files, Downloads) open in the picker.
