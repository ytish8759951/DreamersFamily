-- Align media_assets entity types with the formal growth-record RPC introduced
-- in migration 034. Existing rows and earlier repository code still use
-- growth_record, while the hardened RPC attaches media as growth-record.

alter table public.media_assets
  drop constraint if exists media_assets_entity_type_check;

alter table public.media_assets
  add constraint media_assets_entity_type_check
  check (
    entity_type is null
    or entity_type in (
      'growth_record',
      'growth-record',
      'encouragement_card',
      'album_entry',
      'comment',
      'artifact',
      'special_event',
      'wish',
      'achievement_message',
      'share',
      'dream',
      'mailbox',
      'special-day',
      'avatar',
      'memory',
      'piggy-product',
      'task'
    )
  );
