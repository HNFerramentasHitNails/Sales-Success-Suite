-- Alinhar a precisão dos preços a 5 casas decimais (como o Moloni), evitando
-- divergências de arredondamento entre a app e a faturação certificada.
-- Alargar a escala é não destrutivo (os valores existentes mantêm-se).

ALTER TABLE public.products ALTER COLUMN unit_price TYPE numeric(14,5);

-- order_lines: as colunas geradas dependem de unit_price → recriar a 5 casas.
ALTER TABLE public.order_lines
  DROP COLUMN line_subtotal,
  DROP COLUMN line_tax,
  DROP COLUMN line_total;

ALTER TABLE public.order_lines ALTER COLUMN unit_price TYPE numeric(14,5);

ALTER TABLE public.order_lines
  ADD COLUMN line_subtotal numeric(14,5)
    GENERATED ALWAYS AS ((quantity * unit_price) * (1 - discount_percent / 100)) STORED,
  ADD COLUMN line_tax numeric(14,5)
    GENERATED ALWAYS AS (((quantity * unit_price) * (1 - discount_percent / 100)) * tax_rate / 100) STORED,
  ADD COLUMN line_total numeric(14,5)
    GENERATED ALWAYS AS (((quantity * unit_price) * (1 - discount_percent / 100)) * (1 + tax_rate / 100)) STORED;
