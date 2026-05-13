-- Migration 001: Assignment-Status + Crew-User-Verknüpfung
-- Ausführen in: Supabase Dashboard → SQL Editor → New Query → Run

-- assignments: Status + Vorschlag-Metadaten
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'assigned'
                                        CHECK (status IN ('assigned','proposed','confirmed','declined')),
  ADD COLUMN IF NOT EXISTS proposed_by  UUID REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- crew_members: E-Mail + Supabase-User-Verknüpfung
ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS email   TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE SET NULL;

-- Index für schnelle Lookup nach User-ID
CREATE INDEX IF NOT EXISTS idx_crew_members_user_id ON crew_members(user_id);
