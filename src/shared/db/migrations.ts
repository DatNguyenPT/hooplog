import type { Migration } from './migrate';

/** Every table is sync-ready: client UUID ids, timestamps (ISO-8601 UTC), soft delete. See docs/TECHNICAL_ARCHITECTURE.md. */
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE shooting_session (
        id TEXT PRIMARY KEY NOT NULL,
        started_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE shot (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES shooting_session(id),
        taken_at TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('made', 'missed', 'uncertain')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
        confidence REAL,
        corrected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX idx_shot_session ON shot(session_id);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE shooting_session ADD COLUMN ended_at TEXT;
      -- Sessions created before ended_at existed (M0) are finished; close them so the unique index below can be built.
      UPDATE shooting_session SET ended_at = updated_at WHERE ended_at IS NULL;
      -- At most one open session, enforced by the database (guards against double taps and races).
      CREATE UNIQUE INDEX idx_one_open_session ON shooting_session((1)) WHERE ended_at IS NULL AND deleted_at IS NULL;
    `,
  },
  {
    version: 3,
    sql: `
      -- Built-in exercises have fixed ids and store a translation key in name (exercises.builtin.<name>); custom ones store the typed name.
      CREATE TABLE exercise (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        measurement_type TEXT NOT NULL CHECK (measurement_type IN ('reps', 'reps_weight', 'duration', 'distance')),
        is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE workout_session (
        id TEXT PRIMARY KEY NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      -- Metric units. Which of reps / weight_kg / duration_s / distance_m are set depends on the exercise's measurement_type.
      CREATE TABLE workout_set (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES workout_session(id),
        exercise_id TEXT NOT NULL REFERENCES exercise(id),
        logged_at TEXT NOT NULL,
        reps INTEGER CHECK (reps IS NULL OR reps >= 1),
        weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg >= 0),
        duration_s INTEGER CHECK (duration_s IS NULL OR duration_s >= 1),
        distance_m REAL CHECK (distance_m IS NULL OR distance_m > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX idx_workout_set_session ON workout_set(session_id);
      CREATE INDEX idx_workout_set_exercise ON workout_set(exercise_id);
      -- At most one open workout, enforced by the database (guards against double taps and races).
      CREATE UNIQUE INDEX idx_one_open_workout ON workout_session((1)) WHERE ended_at IS NULL AND deleted_at IS NULL;

      INSERT INTO exercise (id, name, category, measurement_type, is_builtin, created_at, updated_at) VALUES
        ('00000000-0000-4000-8000-000000000001', 'squat', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000002', 'deadlift', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000003', 'lunge', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000004', 'calf_raise', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000005', 'bench_press', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000006', 'overhead_press', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000007', 'hip_thrust', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000008', 'step_up', 'strength', 'reps_weight', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000009', 'push_up', 'strength', 'reps', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000010', 'pull_up', 'strength', 'reps', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000011', 'plank', 'core', 'duration', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000012', 'sit_up', 'core', 'reps', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000013', 'box_jump', 'plyometrics', 'reps', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000014', 'lateral_bound', 'plyometrics', 'reps', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000015', 'burpee', 'conditioning', 'reps', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000016', 'jump_rope', 'conditioning', 'duration', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000017', 'sprint', 'conditioning', 'distance', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000018', 'shuttle_run', 'conditioning', 'distance', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000019', 'defensive_slide', 'agility', 'duration', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000020', 'ladder_drill', 'agility', 'duration', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE training_plan (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      -- At most one active plan, enforced by the database.
      CREATE UNIQUE INDEX idx_one_active_plan ON training_plan((1)) WHERE is_active = 1 AND deleted_at IS NULL;

      -- One row per scheduled activity in the weekly schedule. weekday is ISO (1 = Monday ... 7 = Sunday).
      -- An exercise item carries target_sets plus the targets that fit the exercise's measurement type (metric units);
      -- a shooting item carries target_shots. Progress is derived from the logs, never stored.
      CREATE TABLE plan_item (
        id TEXT PRIMARY KEY NOT NULL,
        plan_id TEXT NOT NULL REFERENCES training_plan(id),
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
        kind TEXT NOT NULL CHECK (kind IN ('exercise', 'shooting')),
        exercise_id TEXT REFERENCES exercise(id),
        target_sets INTEGER CHECK (target_sets IS NULL OR target_sets >= 1),
        target_reps INTEGER CHECK (target_reps IS NULL OR target_reps >= 1),
        target_weight_kg REAL CHECK (target_weight_kg IS NULL OR target_weight_kg >= 0),
        target_duration_s INTEGER CHECK (target_duration_s IS NULL OR target_duration_s >= 1),
        target_distance_m REAL CHECK (target_distance_m IS NULL OR target_distance_m > 0),
        target_shots INTEGER CHECK (target_shots IS NULL OR target_shots >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        CHECK (
          (kind = 'exercise' AND exercise_id IS NOT NULL AND target_sets IS NOT NULL AND target_shots IS NULL)
          OR (kind = 'shooting' AND exercise_id IS NULL AND target_shots IS NOT NULL AND target_sets IS NULL)
        )
      );
      CREATE INDEX idx_plan_item_plan ON plan_item(plan_id);
      -- An exercise appears once per day of a plan, and a plan has one shooting item per day.
      CREATE UNIQUE INDEX idx_plan_item_exercise_day ON plan_item(plan_id, weekday, exercise_id) WHERE kind = 'exercise' AND deleted_at IS NULL;
      CREATE UNIQUE INDEX idx_plan_item_shooting_day ON plan_item(plan_id, weekday) WHERE kind = 'shooting' AND deleted_at IS NULL;
    `,
  },
];
