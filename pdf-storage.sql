-- Run once in your existing Supabase project's SQL Editor.
-- PDFs remain private; only the existing owner account is permitted access.
begin;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('reading-garden-pdfs','reading-garden-pdfs',false,20971520,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
drop policy if exists reading_garden_pdf_owner on storage.objects;
create policy reading_garden_pdf_owner on storage.objects
for all to authenticated
using (bucket_id='reading-garden-pdfs' and auth.uid()='3ad0b62f-79e2-4cff-8b78-0352fd42e8f1'::uuid and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='reading-garden-pdfs' and auth.uid()='3ad0b62f-79e2-4cff-8b78-0352fd42e8f1'::uuid and (storage.foldername(name))[1]=auth.uid()::text);
commit;
