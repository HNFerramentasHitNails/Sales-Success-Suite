-- 1) Enum invoice_mode
CREATE TYPE public.invoice_mode AS ENUM ('manual','on_confirm','on_paid');

-- 2) Coluna em organizations
ALTER TABLE public.organizations
  ADD COLUMN invoice_mode public.invoice_mode NOT NULL DEFAULT 'manual';

-- 3) Extensão pg_net (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4) Tabela runtime_config (singleton, apenas service_role; sem acesso a clientes)
CREATE TABLE public.runtime_config (
  id boolean PRIMARY KEY DEFAULT true,
  edge_base_url text,
  internal_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runtime_config_singleton CHECK (id = true)
);

GRANT ALL ON public.runtime_config TO service_role;

ALTER TABLE public.runtime_config ENABLE ROW LEVEL SECURITY;
-- Intencionalmente sem políticas: nenhum cliente (anon/authenticated) pode ler.
-- Apenas o service_role (que ignora RLS) e funções SECURITY DEFINER acedem.

INSERT INTO public.runtime_config (id) VALUES (true) ON CONFLICT DO NOTHING;

-- 5) Trigger function: emite fatura automaticamente via pg_net, conforme o invoice_mode da org
CREATE OR REPLACE FUNCTION public.trigger_auto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode public.invoice_mode;
  v_url text;
  v_secret text;
  v_should boolean := false;
  v_old_status public.order_status;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;

  IF NEW.status IS DISTINCT FROM v_old_status THEN
    SELECT invoice_mode INTO v_mode
      FROM public.organizations WHERE id = NEW.organization_id;

    IF v_mode = 'on_confirm' AND NEW.status = 'confirmada' THEN
      v_should := true;
    ELSIF v_mode = 'on_paid' AND NEW.status = 'paga' THEN
      v_should := true;
    END IF;

    IF v_should THEN
      SELECT edge_base_url, internal_secret
        INTO v_url, v_secret
        FROM public.runtime_config WHERE id = true;

      IF v_url IS NOT NULL AND length(v_url) > 0 AND v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url := rtrim(v_url,'/') || '/auto-invoice',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-internal-secret', v_secret
          ),
          body := jsonb_build_object('order_id', NEW.id)
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 6) Triggers em orders (UPDATE e INSERT para cobrir todas as transições)
DROP TRIGGER IF EXISTS orders_auto_invoice_upd ON public.orders;
CREATE TRIGGER orders_auto_invoice_upd
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_invoice();

DROP TRIGGER IF EXISTS orders_auto_invoice_ins ON public.orders;
CREATE TRIGGER orders_auto_invoice_ins
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trigger_auto_invoice();