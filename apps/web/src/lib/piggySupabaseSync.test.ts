import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('piggy Supabase transaction sync hardening', () => {
  it('adds formal idempotency columns, media references, and transaction RPCs', () => {
    const migration = readRepoFile('supabase/migrations/033_piggy_transaction_sync.sql');

    expect(migration).toContain('alter table public.piggy_bank_records');
    expect(migration).toContain('add column if not exists client_request_id text');
    expect(migration).toContain('alter table public.store_items');
    expect(migration).toContain('add column if not exists main_media_id uuid');
    expect(migration).toContain('gallery_media_ids uuid[]');
    expect(migration).toContain('alter table public.purchases');
    expect(migration).toContain('uq_piggy_bank_records_request');
    expect(migration).toContain('uq_store_items_request');
    expect(migration).toContain('uq_purchases_request');
    expect(migration).toContain('create_piggy_income_with_deposit');
    expect(migration).toContain('upsert_piggy_product_from_repository');
    expect(migration).toContain('apply_piggy_purchase_event');
    expect(migration).toContain('Piggy balance is insufficient');
  });

  it('routes piggy writes through dedicated Supabase RPC helpers instead of delegateWrite only', () => {
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(source).toContain('persistPiggyIncomeWithDeposit');
    expect(source).toContain("rpc('create_piggy_income_with_deposit'");
    expect(source).toContain('persistPiggyProduct');
    expect(source).toContain("rpc('upsert_piggy_product_from_repository'");
    expect(source).toContain('persistPiggyPurchaseEvent');
    expect(source).toContain("rpc('apply_piggy_purchase_event'");
    expect(source).not.toContain("addPiggyIncome = this.delegateWrite('addPiggyIncome')");
    expect(source).not.toContain("requestPiggyPurchase = this.delegateWrite('requestPiggyPurchase')");
  });

  it('keeps product media and request ids in formal Supabase rows, not only payload snapshots', () => {
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(source).toContain('main_media_id: product.main_media_id');
    expect(source).toContain('gallery_media_ids: product.gallery_media_ids');
    expect(source).toContain('client_request_id: product.client_request_id ?? null');
    expect(source).toContain('client_request_id: purchase.client_request_id ?? null');
    expect(source).toContain('client_request_id: income.client_request_id ?? null');
    expect(source).toContain('client_request_id: log.client_request_id ?? null');
  });

  it('adds formal tablet-time ledger idempotency and RPC guards', () => {
    const migration = readRepoFile('supabase/migrations/033_piggy_transaction_sync.sql');
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(migration).toContain('alter table public.tablet_time');
    expect(migration).toContain('uq_tablet_time_request');
    expect(migration).toContain('apply_tablet_time_log');
    expect(migration).toContain('Screen time cannot be deducted below zero');
    expect(source).toContain('persistTabletTimeLog');
    expect(source).toContain("rpc('apply_tablet_time_log'");
    expect(source).not.toContain("addScreenTime = this.delegateWrite('addScreenTime')");
    expect(source).not.toContain("recordScreenTimeUsed = this.delegateWrite('recordScreenTimeUsed')");
  });

  it('adds formal badge catalog and award RPCs with existing star ledger integration', () => {
    const migration = readRepoFile('supabase/migrations/033_piggy_transaction_sync.sql');
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(migration).toContain('alter table public.badges');
    expect(migration).toContain('reward_stars integer');
    expect(migration).toContain('uq_badges_request');
    expect(migration).toContain('uq_child_badges_request');
    expect(migration).toContain('upsert_badge_catalog_from_repository');
    expect(migration).toContain('award_child_badge_from_repository');
    expect(migration).toContain("insert into public.stars");
    expect(migration).toContain("badge:' || v_row.id::text || ':stars");
    expect(source).toContain('persistBadgeCatalog');
    expect(source).toContain("rpc('upsert_badge_catalog_from_repository'");
    expect(source).toContain('persistChildBadgeAward');
    expect(source).toContain("rpc('award_child_badge_from_repository'");
    expect(source).not.toContain("createBadge = this.delegateWrite('createBadge')");
    expect(source).not.toContain("awardBadge = this.delegateWrite('awardBadge')");
  });

  it('adds formal mailbox message RPCs with media references and idempotency', () => {
    const migration = readRepoFile('supabase/migrations/033_piggy_transaction_sync.sql');
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(migration).toContain('alter table public.encouragement_cards');
    expect(migration).toContain('media_id uuid references public.media_assets');
    expect(migration).toContain('client_request_id text');
    expect(migration).toContain('uq_encouragement_cards_request');
    expect(migration).toContain('upsert_mailbox_message_from_repository');
    expect(migration).toContain("entity_type = 'mailbox'");
    expect(source).toContain('persistMailboxMessage');
    expect(source).toContain("rpc('upsert_mailbox_message_from_repository'");
    expect(source).toContain('media_id: message.media_id');
    expect(source).not.toContain("createMailboxMessage = this.delegateWrite('createMailboxMessage')");
    expect(source).not.toContain("markMessageRead = this.delegateWrite('markMessageRead')");
  });
});
