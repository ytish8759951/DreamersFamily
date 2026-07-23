-- Allow the parent mailbox image-message UI type to persist through the
-- canonical mailbox RPC without mapping it to the legacy "photo" label.
alter table public.encouragement_cards
  drop constraint if exists encouragement_cards_card_type_check;

alter table public.encouragement_cards
  add constraint encouragement_cards_card_type_check
    check (card_type in ('text', 'card', 'photo', 'audio', 'image', 'video', 'mixed'));
