-- Allow project delegates to manage exhibition_works (insert/update/delete) for delegated exhibitions.

create policy exhibition_works_insert_delegate on public.exhibition_works
  for insert to authenticated
  with check (
    exists (
      select 1 from public.delegations d
      where d.project_id = exhibition_id
        and d.delegate_profile_id = auth.uid()
        and d.scope_type = 'project'
        and d.status = 'active'
        and 'manage_works' = any(d.permissions)
    )
  );

create policy exhibition_works_update_delegate on public.exhibition_works
  for update to authenticated
  using (
    exists (
      select 1 from public.delegations d
      where d.project_id = exhibition_id
        and d.delegate_profile_id = auth.uid()
        and d.scope_type = 'project'
        and d.status = 'active'
        and 'manage_works' = any(d.permissions)
    )
  )
  with check (
    exists (
      select 1 from public.delegations d
      where d.project_id = exhibition_id
        and d.delegate_profile_id = auth.uid()
        and d.scope_type = 'project'
        and d.status = 'active'
        and 'manage_works' = any(d.permissions)
    )
  );

create policy exhibition_works_delete_delegate on public.exhibition_works
  for delete to authenticated
  using (
    exists (
      select 1 from public.delegations d
      where d.project_id = exhibition_id
        and d.delegate_profile_id = auth.uid()
        and d.scope_type = 'project'
        and d.status = 'active'
        and 'manage_works' = any(d.permissions)
    )
  );

-- Allow delegates to update project (exhibition) metadata when they have edit_metadata permission.
-- Split original "for all" into insert/update/delete so delegates can only update, not create/delete project.
drop policy if exists projects_insert_update_delete_curator on public.projects;

create policy projects_insert_curator on public.projects
  for insert to authenticated
  with check (curator_id = auth.uid() or host_profile_id = auth.uid());

create policy projects_delete_curator on public.projects
  for delete to authenticated
  using (curator_id = auth.uid() or host_profile_id = auth.uid());

create policy projects_update_curator_or_delegate on public.projects
  for update to authenticated
  using (
    curator_id = auth.uid()
    or host_profile_id = auth.uid()
    or exists (
      select 1 from public.delegations d
      where d.project_id = id
        and d.delegate_profile_id = auth.uid()
        and d.scope_type = 'project'
        and d.status = 'active'
        and ('edit_metadata' = any(d.permissions) or 'manage_works' = any(d.permissions))
    )
  )
  with check (
    curator_id = auth.uid()
    or host_profile_id = auth.uid()
    or exists (
      select 1 from public.delegations d
      where d.project_id = id
        and d.delegate_profile_id = auth.uid()
        and d.scope_type = 'project'
        and d.status = 'active'
        and ('edit_metadata' = any(d.permissions) or 'manage_works' = any(d.permissions))
    )
  );
