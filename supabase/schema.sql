-- ═══════════════════════════════════════════════════════════════════════════════
-- Tour Crew Plan — Supabase Schema + RLS
-- Ausführen in: Supabase Dashboard → SQL Editor → New Query → Run
-- Region: eu-central-1 (Frankfurt) — DSGVO-konform
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Hilfsfunktionen für Row Level Security ────────────────────────────────────

CREATE OR REPLACE FUNCTION user_can_read_plan(p_plan_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM plans WHERE id = p_plan_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM plan_members WHERE plan_id = p_plan_id AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION user_can_write_plan(p_plan_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM plans WHERE id = p_plan_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM plan_members
      WHERE plan_id = p_plan_id AND user_id = auth.uid() AND role IN ('owner', 'editor')
  );
END;
$$;

-- ── Tabellen ──────────────────────────────────────────────────────────────────

-- Pläne (ein Plan = ein Tourplan z.B. "Tour 2026")
CREATE TABLE IF NOT EXISTS plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zugriffskontrolle pro Plan
CREATE TABLE IF NOT EXISTS plan_members (
  plan_id UUID NOT NULL REFERENCES plans ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (plan_id, user_id)
);

-- Crew-Mitglieder (Namen als Strings, wie im Original)
CREATE TABLE IF NOT EXISTS crew_members (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID    NOT NULL REFERENCES plans ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Positionen (GL, System, Licht 1, …)
CREATE TABLE IF NOT EXISTS positions (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID    NOT NULL REFERENCES plans ON DELETE CASCADE,
  pos_id     TEXT    NOT NULL,   -- z.B. 'gl', 'sys', 'lt1'
  label      TEXT    NOT NULL,
  short      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (plan_id, pos_id)
);

-- Standard-Besetzung pro Position (wird als Fallback angezeigt wenn kein Override)
CREATE TABLE IF NOT EXISTS default_crew (
  plan_id      UUID NOT NULL REFERENCES plans ON DELETE CASCADE,
  pos_id       TEXT NOT NULL,
  crew_name    TEXT,
  PRIMARY KEY (plan_id, pos_id)
);

-- Tour-Tage
CREATE TABLE IF NOT EXISTS tour_dates (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID    NOT NULL REFERENCES plans ON DELETE CASCADE,
  date       DATE    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('show', 'reise', 'prep', 'off')),
  type_label TEXT    NOT NULL DEFAULT '',
  location   TEXT    NOT NULL DEFAULT '',
  block_id   TEXT,
  block_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (plan_id, date)
);

-- Besetzungen: wer macht welche Position an welchem Tag
CREATE TABLE IF NOT EXISTS assignments (
  plan_id    UUID NOT NULL REFERENCES plans ON DELETE CASCADE,
  date       DATE NOT NULL,
  pos_id     TEXT NOT NULL,
  crew_name  TEXT,          -- NULL = explizit freigestellt; '__offen__' = noch offen
  PRIMARY KEY (plan_id, date, pos_id)
);

-- Benutzerdefinierte Tagesarten (global pro User, nicht pro Plan)
CREATE TABLE IF NOT EXISTS custom_types (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID    NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  v          TEXT    NOT NULL,
  label      TEXT    NOT NULL,
  type       TEXT    NOT NULL CHECK (type IN ('show', 'reise', 'prep', 'off')),
  color      TEXT    NOT NULL DEFAULT '#888888',
  weight     NUMERIC NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, label)
);

-- Invite-Tokens (Einladungslinks)
CREATE TABLE IF NOT EXISTS invites (
  token      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    UUID        NOT NULL REFERENCES plans ON DELETE CASCADE,
  created_by UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  used_by    UUID        REFERENCES auth.users ON DELETE SET NULL,
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row Level Security aktivieren ─────────────────────────────────────────────

ALTER TABLE plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE default_crew ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_dates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites      ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: plans ───────────────────────────────────────────────────────

CREATE POLICY "plans_select" ON plans FOR SELECT
  USING (user_can_read_plan(id));

CREATE POLICY "plans_insert" ON plans FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "plans_update" ON plans FOR UPDATE
  USING (user_can_write_plan(id));

CREATE POLICY "plans_delete" ON plans FOR DELETE
  USING (owner_id = auth.uid());

-- ── RLS Policies: plan_members ────────────────────────────────────────────────

CREATE POLICY "plan_members_select" ON plan_members FOR SELECT
  USING (user_can_read_plan(plan_id));

CREATE POLICY "plan_members_insert" ON plan_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM plans WHERE id = plan_id AND owner_id = auth.uid())
  );

CREATE POLICY "plan_members_delete" ON plan_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM plans WHERE id = plan_id AND owner_id = auth.uid())
    OR user_id = auth.uid()
  );

-- ── RLS Policies: crew_members ────────────────────────────────────────────────

CREATE POLICY "crew_members_select" ON crew_members FOR SELECT
  USING (user_can_read_plan(plan_id));

CREATE POLICY "crew_members_insert" ON crew_members FOR INSERT
  WITH CHECK (user_can_write_plan(plan_id));

CREATE POLICY "crew_members_update" ON crew_members FOR UPDATE
  USING (user_can_write_plan(plan_id));

CREATE POLICY "crew_members_delete" ON crew_members FOR DELETE
  USING (user_can_write_plan(plan_id));

-- ── RLS Policies: positions ───────────────────────────────────────────────────

CREATE POLICY "positions_select" ON positions FOR SELECT
  USING (user_can_read_plan(plan_id));

CREATE POLICY "positions_insert" ON positions FOR INSERT
  WITH CHECK (user_can_write_plan(plan_id));

CREATE POLICY "positions_update" ON positions FOR UPDATE
  USING (user_can_write_plan(plan_id));

CREATE POLICY "positions_delete" ON positions FOR DELETE
  USING (user_can_write_plan(plan_id));

-- ── RLS Policies: default_crew ────────────────────────────────────────────────

CREATE POLICY "default_crew_select" ON default_crew FOR SELECT
  USING (user_can_read_plan(plan_id));

CREATE POLICY "default_crew_insert" ON default_crew FOR INSERT
  WITH CHECK (user_can_write_plan(plan_id));

CREATE POLICY "default_crew_update" ON default_crew FOR UPDATE
  USING (user_can_write_plan(plan_id));

CREATE POLICY "default_crew_delete" ON default_crew FOR DELETE
  USING (user_can_write_plan(plan_id));

-- ── RLS Policies: tour_dates ──────────────────────────────────────────────────

CREATE POLICY "tour_dates_select" ON tour_dates FOR SELECT
  USING (user_can_read_plan(plan_id));

CREATE POLICY "tour_dates_insert" ON tour_dates FOR INSERT
  WITH CHECK (user_can_write_plan(plan_id));

CREATE POLICY "tour_dates_update" ON tour_dates FOR UPDATE
  USING (user_can_write_plan(plan_id));

CREATE POLICY "tour_dates_delete" ON tour_dates FOR DELETE
  USING (user_can_write_plan(plan_id));

-- ── RLS Policies: assignments ─────────────────────────────────────────────────

CREATE POLICY "assignments_select" ON assignments FOR SELECT
  USING (user_can_read_plan(plan_id));

CREATE POLICY "assignments_insert" ON assignments FOR INSERT
  WITH CHECK (user_can_write_plan(plan_id));

CREATE POLICY "assignments_update" ON assignments FOR UPDATE
  USING (user_can_write_plan(plan_id));

CREATE POLICY "assignments_delete" ON assignments FOR DELETE
  USING (user_can_write_plan(plan_id));

-- ── RLS Policies: custom_types ────────────────────────────────────────────────

CREATE POLICY "custom_types_select" ON custom_types FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "custom_types_insert" ON custom_types FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "custom_types_update" ON custom_types FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "custom_types_delete" ON custom_types FOR DELETE
  USING (user_id = auth.uid());

-- ── RLS Policies: invites ─────────────────────────────────────────────────────

CREATE POLICY "invites_select_creator" ON invites FOR SELECT
  USING (created_by = auth.uid() OR used_by = auth.uid());

CREATE POLICY "invites_insert" ON invites FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND user_can_write_plan(plan_id)
  );

CREATE POLICY "invites_update_use" ON invites FOR UPDATE
  USING (used_by IS NULL AND expires_at > now());

-- ── Storage Bucket für Logos ──────────────────────────────────────────────────
-- Im Supabase Dashboard: Storage → New Bucket → Name: "logos", Public: false
-- Danach diese Policy anlegen (oder manuell im Dashboard):
--
-- INSERT INTO storage.policies (name, bucket_id, operation, definition)
-- VALUES
--   ('logos_select', 'logos', 'SELECT', 'auth.role() = ''authenticated'''),
--   ('logos_insert', 'logos', 'INSERT', 'auth.role() = ''authenticated'''),
--   ('logos_update', 'logos', 'UPDATE', 'auth.role() = ''authenticated'''),
--   ('logos_delete', 'logos', 'DELETE', 'auth.role() = ''authenticated''');

-- ── Performance-Indizes ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_plans_owner          ON plans(owner_id);
CREATE INDEX IF NOT EXISTS idx_plan_members_user    ON plan_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_plan    ON crew_members(plan_id);
CREATE INDEX IF NOT EXISTS idx_positions_plan       ON positions(plan_id);
CREATE INDEX IF NOT EXISTS idx_tour_dates_plan_date ON tour_dates(plan_id, date);
CREATE INDEX IF NOT EXISTS idx_assignments_plan     ON assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_custom_types_user    ON custom_types(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_token        ON invites(token);
