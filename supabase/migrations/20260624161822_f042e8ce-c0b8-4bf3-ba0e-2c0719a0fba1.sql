
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant_label text;
CREATE INDEX IF NOT EXISTS products_parent_idx ON public.products(parent_product_id);

CREATE OR REPLACE FUNCTION public.trg_products_variant_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.parent_product_id IS NOT NULL THEN
    IF NEW.parent_product_id = NEW.id THEN
      RAISE EXCEPTION 'Um produto não pode ser variante de si próprio';
    END IF;
    IF EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.parent_product_id AND p.parent_product_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Variantes só podem ter 1 nível (o produto principal não pode ser ele próprio uma variante)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.products c WHERE c.parent_product_id = NEW.id) THEN
      RAISE EXCEPTION 'Este produto já tem variantes; não pode tornar-se variante de outro';
    END IF;
    IF EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.parent_product_id AND p.organization_id <> NEW.organization_id) THEN
      RAISE EXCEPTION 'O produto principal pertence a outra organização';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_variant_guard ON public.products;
CREATE TRIGGER products_variant_guard
  BEFORE INSERT OR UPDATE OF parent_product_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_variant_guard();
