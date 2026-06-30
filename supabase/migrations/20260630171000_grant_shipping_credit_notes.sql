-- Tabelas criadas via SQL não recebem GRANT automático ao papel 'authenticated'.
-- A RLS continua a restringir as linhas; o GRANT dá apenas o privilégio ao nível da tabela.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_rules TO authenticated;
GRANT SELECT ON public.credit_notes TO authenticated;
