-- Bind child QR tokens to explicit child records.

alter table public.device_bindings
  add column if not exists token text,
  add column if not exists child_name text,
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz;

update public.device_bindings db
set
  token = coalesce(db.token, c.child_token),
  child_name = coalesce(nullif(db.child_name, ''), c.display_name),
  expires_at = coalesce(db.expires_at, coalesce(c.child_token_updated_at, db.created_at) + interval '24 hours'),
  used_at = coalesce(db.used_at, c.child_token_consumed_at),
  revoked_at = case
    when db.qr_token_status = 'revoked' then coalesce(db.revoked_at, db.updated_at)
    else db.revoked_at
  end
from public.children c
where c.id = db.child_id
  and c.family_id = db.family_id;

alter table public.device_bindings
  alter column child_name set default '',
  alter column expires_at set default (now() + interval '24 hours');

create index if not exists idx_device_bindings_token
  on public.device_bindings(token)
  where token is not null;
