-- Guarda quando o utilizador terminou/fechou o tour de boas-vindas, para não o repetir
-- (persiste entre dispositivos/browsers, ao contrário de localStorage).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz;
