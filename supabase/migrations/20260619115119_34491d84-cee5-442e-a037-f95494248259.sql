alter policy customer_notes_select_same_org on public.customer_notes to authenticated;
alter policy customer_notes_insert_member  on public.customer_notes to authenticated;
alter policy customer_notes_update_member  on public.customer_notes to authenticated;
alter policy customer_notes_delete_member  on public.customer_notes to authenticated;
alter policy members_insert_admin          on public.organization_members to authenticated;
alter policy tenant_isolation              on public.external_refs to authenticated;