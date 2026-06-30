-- Ligar Moloni (faturação certificada AT) — registo do conector.
--
-- O Moloni não tem host de sandbox separado: "sandbox" = uma EMPRESA de teste na conta
-- Moloni (company_id de teste). As credenciais são guardadas encriptadas em connection_secrets
-- (campos secret). company_id/document_set_id ficam em connections.config (não secretos).
-- is_certified=true ativa os guard-rails (a fatura só fica 'issued' com external_id+pdf_url).

INSERT INTO public.connector_definitions (key, name, category, description, config_schema, is_active, is_certified)
VALUES (
  'moloni',
  'Moloni',
  'invoicing',
  'Faturação certificada AT (Moloni). Use uma empresa de teste para sandbox.',
  jsonb_build_object('fields', jsonb_build_array(
    jsonb_build_object('key','client_id','label','Client ID (API Moloni)','type','password','required',true,'secret',true),
    jsonb_build_object('key','client_secret','label','Client Secret','type','password','required',true,'secret',true),
    jsonb_build_object('key','developer_username','label','Utilizador developer (email)','type','password','required',true,'secret',true),
    jsonb_build_object('key','developer_password','label','Palavra-passe developer','type','password','required',true,'secret',true),
    jsonb_build_object('key','company_id','label','Company ID (empresa de teste / sandbox)','type','text','required',false,'secret',false),
    jsonb_build_object('key','document_set_id','label','ID do conjunto de documentos (série de faturas)','type','text','required',false,'secret',false)
  )),
  true,
  true
)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      config_schema = EXCLUDED.config_schema,
      is_active = true,
      is_certified = true;
