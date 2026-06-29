-- Reuniões online: adicionar URL do Google Meet às atividades
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS meeting_url text;