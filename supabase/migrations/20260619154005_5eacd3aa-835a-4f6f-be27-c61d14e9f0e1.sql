
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.pipeline_stages (organization_id, name, position, color, is_won, is_lost) VALUES
    (NEW.id, 'Novo Lead',         0, '220 60% 55%', false, false),
    (NEW.id, '1º Contacto',       1, '200 70% 45%', false, false),
    (NEW.id, 'Follow-up',         2, '260 60% 55%', false, false),
    (NEW.id, 'Reunião Agendada',  3, '38 92% 50%',  false, false),
    (NEW.id, 'Negociação',        4, '25 95% 53%',  false, false),
    (NEW.id, 'Ganho',             5, '142 71% 45%', true,  false),
    (NEW.id, 'Perdido',           6, '0 72% 51%',   false, true);
  RETURN NEW;
END;
$function$;
