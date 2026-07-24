import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const siteUrl = process.env.DREAMERSFAMILY_SITE_URL || 'https://dreamersfamily.pages.dev/';
const explicitUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const explicitAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const nowLabel = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const qaLabel = `E2E-${nowLabel}-drawing`;
const password = `Df-${nowLabel}-${Math.random().toString(36).slice(2)}!`;
const email = `df-e2e-${nowLabel}-${Math.random().toString(36).slice(2)}@example.com`;
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAI0lEQVR4nGP8z8DwnwEJMDIwMDAw+M+ABBgYGJgYGABtWQYO2d2syQAAAABJRU5ErkJggg==',
  'base64'
);

const evidence = {
  qaLabel,
  siteUrl,
  family_id: null,
  child_id: null,
  second_child_id: null,
  share_id: null,
  share_media_id: null,
  media_id: null,
  parent_notification_id: null,
  child_notification_id: null,
  stars_ledger_id: null,
  storage_path: null,
  storage_bytes: pngBytes.length,
  signed_url_http_status: null,
  duplicate_share_count: null,
  duplicate_star_count: null,
  parent_result: null,
  child_result: null,
  second_child_result: null,
  cleanup: null,
  pass: false
};

const createdStoragePaths = [];

try {
  const config = explicitUrl && explicitAnon ? { url: explicitUrl, anonKey: explicitAnon } : await readPublicSupabaseConfig(siteUrl);
  const parent = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  await signUpAndCreateFamily(parent, config);
  const scope = await createFamily(parent);
  evidence.family_id = scope.familyId;
  const parentId = scope.parentId;

  const child = await createChild(parent, scope.familyId, parentId, `${qaLabel}-child-a`);
  const secondChild = await createChild(parent, scope.familyId, parentId, `${qaLabel}-child-b`);
  evidence.child_id = child.id;
  evidence.second_child_id = secondChild.id;

  const deviceId = crypto.randomUUID();
  const secondDeviceId = crypto.randomUUID();
  const bindingId = `${child.id}:${deviceId}`;
  const secondBindingId = `${secondChild.id}:${secondDeviceId}`;
  await createBinding(parent, scope.familyId, child.id, child.display_name, deviceId, bindingId);
  await createBinding(parent, scope.familyId, secondChild.id, secondChild.display_name, secondDeviceId, secondBindingId);

  const childClient = createChildClient(config, child.id, deviceId, bindingId);
  const secondChildClient = createChildClient(config, secondChild.id, secondDeviceId, secondBindingId);

  const shareId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const storagePath = storagePathFor(scope.familyId, child.id, mediaId);
  evidence.share_id = shareId;
  evidence.share_media_id = mediaId;
  evidence.media_id = mediaId;
  evidence.storage_path = storagePath;
  createdStoragePaths.push(storagePath);

  await uploadDrawingPng(childClient, storagePath);
  await insertMediaAsset(childClient, {
    id: mediaId,
    familyId: scope.familyId,
    childId: child.id,
    shareId,
    storagePath
  });

  const clientRequestId = `drawing-share-live-e2e:${shareId}`;
  const firstShare = await finalizeDrawingShare(childClient, {
    shareId,
    mediaId,
    familyId: scope.familyId,
    childId: child.id,
    storagePath,
    clientRequestId,
    bindingId,
    deviceId
  });
  const retryShare = await finalizeDrawingShare(childClient, {
    shareId,
    mediaId,
    familyId: scope.familyId,
    childId: child.id,
    storagePath,
    clientRequestId,
    bindingId,
    deviceId
  });
  if (firstShare.share.id !== retryShare.share.id) throw new Error('Drawing share idempotency returned a different share id.');

  const signed = await parent.storage.from('family-media').createSignedUrl(storagePath, 120);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error('Signed URL was not returned.');
  const signedResponse = await fetch(signed.data.signedUrl);
  evidence.signed_url_http_status = signedResponse.status;
  if (signedResponse.status !== 200) throw new Error(`Signed URL returned HTTP ${signedResponse.status}`);

  const parentShare = await selectOne(parent, 'shares', 'id,share_type,family_id,child_id,title,caption,status', 'id', shareId);
  const parentMedia = await selectOne(parent, 'share_media', 'id,media_asset_id,share_id,media_type,storage_path,file_size_bytes,sort_order', 'share_id', shareId);
  if (parentShare.share_type !== 'drawing') throw new Error(`Expected drawing share type, received ${parentShare.share_type}`);
  if (parentMedia.media_asset_id !== mediaId || parentMedia.storage_path !== storagePath || Number(parentMedia.file_size_bytes) <= 0) {
    throw new Error('Share media did not bind the uploaded drawing media asset.');
  }
  evidence.parent_result = {
    share_type: parentShare.share_type,
    status: parentShare.status,
    media_asset_id: parentMedia.media_asset_id,
    media_type: parentMedia.media_type
  };

  const childSnapshot = await getChildSnapshot(childClient, child.id, bindingId, deviceId);
  const childShareVisible = (childSnapshot.shares ?? []).some((share) => share.id === shareId && share.share_type === 'drawing');
  const childMediaVisible = (childSnapshot.share_media ?? []).some((media) => media.share_id === shareId && media.media_asset_id === mediaId);
  evidence.child_result = { shareVisible: childShareVisible, mediaVisible: childMediaVisible };
  if (!childShareVisible || !childMediaVisible) throw new Error('Child scoped snapshot did not return the drawing share and media.');

  const secondSnapshot = await getChildSnapshot(secondChildClient, secondChild.id, secondBindingId, secondDeviceId);
  const secondChildCanSeeShare = (secondSnapshot.shares ?? []).some((share) => share.id === shareId);
  evidence.second_child_result = { canSeeFirstChildDrawing: secondChildCanSeeShare };
  if (secondChildCanSeeShare) throw new Error('Second child can see first child drawing share.');

  const parentNotifications = await selectRows(parent, 'notifications', 'id,notification_type,entity_type,entity_id,recipient_child_id,recipient_user_id,read_at', {
    entity_id: shareId,
    notification_type: 'share_submitted'
  });
  evidence.parent_notification_id = parentNotifications[0]?.id ?? null;
  if (!evidence.parent_notification_id) throw new Error('Parent share_submitted notification was not created.');

  const firstStar = await encourageShare(parent, shareId, 3);
  const retryStar = await encourageShare(parent, shareId, 3);
  evidence.stars_ledger_id = firstStar.id;
  if (firstStar.id !== retryStar.id) throw new Error('Share encouragement retry created a different stars ledger row.');

  const starRows = await selectRows(parent, 'stars', 'id,share_id,amount,transaction_type', {
    share_id: shareId,
    transaction_type: 'share_reward'
  });
  evidence.duplicate_star_count = starRows.length;
  if (starRows.length !== 1) throw new Error(`Expected one share_reward stars row, found ${starRows.length}.`);

  const childNotifications = await selectRows(parent, 'notifications', 'id,notification_type,entity_type,entity_id,recipient_child_id,read_at', {
    entity_id: shareId,
    notification_type: 'share_stars_awarded'
  });
  evidence.child_notification_id = childNotifications[0]?.id ?? null;
  if (!evidence.child_notification_id) throw new Error('Child share_stars_awarded notification was not created.');

  const duplicateShares = await selectRows(parent, 'shares', 'id,client_request_id', {
    family_id: scope.familyId,
    child_id: child.id,
    client_request_id: clientRequestId
  });
  evidence.duplicate_share_count = duplicateShares.length;
  if (duplicateShares.length !== 1) throw new Error(`Expected one drawing share for client_request_id, found ${duplicateShares.length}.`);

  evidence.pass = true;
} finally {
  await cleanupIfPossible();
  await writeEvidence();
}

if (!evidence.pass) {
  console.error(JSON.stringify(redactEvidence(evidence), null, 2));
  process.exit(1);
}

console.log(JSON.stringify(redactEvidence(evidence), null, 2));

async function readPublicSupabaseConfig(appUrl) {
  const html = await fetchText(appUrl);
  const initialScripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => new URL(match[1], appUrl).toString());
  const visited = new Set();
  const pending = [...initialScripts];
  while (pending.length) {
    const entryUrl = pending.shift();
    if (!entryUrl || visited.has(entryUrl)) continue;
    visited.add(entryUrl);
    const bundle = await fetchText(entryUrl);
    const url = (bundle.match(/https:\/\/[a-z0-9-]+\.supabase\.co/) ?? [])[0];
    const keys = [...bundle.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)].map((match) => match[0]);
    const anonKey = keys.find((key) => key.length > 80);
    if (url && anonKey) return { url, anonKey };
    for (const match of bundle.matchAll(/["'`](?:\.\/)?(\/?assets\/[^"'`]+\.js)["'`]/g)) {
      pending.push(new URL(match[1].startsWith('/') ? match[1] : `/${match[1]}`, appUrl).toString());
    }
  }
  throw new Error('Unable to extract public Supabase config. Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  return response.text();
}

async function signUpAndCreateFamily(client) {
  const signup = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: qaLabel } }
  });
  if (signup.error) throw signup.error;
  if (!signup.data.session) {
    const signin = await client.auth.signInWithPassword({ email, password });
    if (signin.error) throw signin.error;
  }
}

async function createFamily(client) {
  const { data, error } = await client.rpc('create_family_for_current_user', {
    family_name: qaLabel
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const familyId = row?.familyId ?? row?.family_id;
  const parentId = row?.parentId ?? row?.parent_id;
  if (!familyId || !parentId) throw new Error('create_family_for_current_user did not return familyId and parentId.');
  return { familyId, parentId };
}

async function createChild(client, familyId, parentId, displayName) {
  const child = {
    family_id: familyId,
    parent_id: parentId,
    display_name: displayName,
    legal_name: displayName,
    birth_date: '2020-07-20',
    status: 'active',
    created_by: parentId
  };
  const { data, error } = await client.from('children').insert(child).select('*').single();
  if (error) throw error;
  return data;
}

async function createBinding(client, familyId, childId, childName, deviceId, bindingId) {
  const now = new Date();
  const row = {
    id: bindingId,
    token: `qa-${bindingId}`,
    family_id: familyId,
    child_id: childId,
    child_name: childName,
    device_id: deviceId,
    expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    used_at: now.toISOString(),
    revoked_at: null,
    binding_status: 'bound',
    qr_token_status: 'used',
    device_binding_status: 'active',
    activated_at: now.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  const { error } = await client.from('device_bindings').upsert(row, { onConflict: 'child_id,device_id' });
  if (error) throw error;
}

function createChildClient(config, childId, deviceId, bindingId) {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        'x-child-id': childId,
        'x-child-device-id': deviceId,
        'x-child-device-binding-id': bindingId
      }
    }
  });
}

function storagePathFor(familyId, childId, mediaId) {
  const date = new Date();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${familyId}/${childId}/${year}/${month}/share/${mediaId}.png`;
}

async function uploadDrawingPng(client, storagePath) {
  const { error } = await client.storage.from('family-media').upload(storagePath, pngBytes, {
    contentType: 'image/png',
    cacheControl: '31536000',
    upsert: false
  });
  if (error) throw error;
}

async function insertMediaAsset(client, input) {
  const { error } = await client.from('media_assets').insert({
    id: input.id,
    family_id: input.familyId,
    child_id: input.childId,
    entity_type: 'share',
    entity_id: input.shareId,
    media_kind: 'photo',
    purpose: 'content',
    bucket: 'family-media',
    path: input.storagePath,
    mime_type: 'image/png',
    file_size: pngBytes.length,
    uploaded_by_child_id: input.childId
  });
  if (error) throw error;
}

async function finalizeDrawingShare(client, input) {
  const { data, error } = await client.rpc('create_share_from_repository', {
    p_share: {
      id: input.shareId,
      family_id: input.familyId,
      child_id: input.childId,
      title: `${qaLabel} 畫作`,
      caption: '孩子端畫板分享 Production Live E2E',
      share_type: 'drawing',
      source_type: 'child_device',
      status: 'approved',
      client_request_id: input.clientRequestId,
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    p_media: [{
      id: input.mediaId,
      media_asset_id: input.mediaId,
      media_type: 'photo',
      bucket: 'family-media',
      storage_path: input.storagePath,
      mime_type: 'image/png',
      file_size_bytes: pngBytes.length,
      width: 2048,
      height: 1536,
      sort_order: 0,
      created_at: new Date().toISOString()
    }],
    p_device_binding_id: input.bindingId,
    p_device_id: input.deviceId
  });
  if (error) throw error;
  return data;
}

async function getChildSnapshot(client, childId, bindingId, deviceId) {
  const { data, error } = await client.rpc('get_child_scoped_repository_state', {
    p_child_id: childId,
    p_device_binding_id: bindingId,
    p_device_id: deviceId
  });
  if (error) throw error;
  return data;
}

async function encourageShare(client, shareId, stars) {
  const { data, error } = await client.rpc('encourage_share_with_stars', {
    p_share_id: shareId,
    p_stars: stars
  });
  if (error) throw error;
  return data;
}

async function selectOne(client, table, columns, column, value) {
  const { data, error } = await client.from(table).select(columns).eq(column, value).single();
  if (error) throw error;
  return data;
}

async function selectRows(client, table, columns, filters) {
  let query = client.from(table).select(columns);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function cleanupIfPossible() {
  if (!evidence.family_id) return;
  try {
    const config = explicitUrl && explicitAnon ? { url: explicitUrl, anonKey: explicitAnon } : await readPublicSupabaseConfig(siteUrl);
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signin = await client.auth.signInWithPassword({ email, password });
    if (signin.error) throw signin.error;
    if (createdStoragePaths.length) {
      await client.storage.from('family-media').remove(createdStoragePaths);
    }
    const { data, error } = await client.rpc('execute_test_data_cleanup', {
      p_family_id: evidence.family_id,
      p_remove_family: true
    });
    if (error) throw error;
    evidence.cleanup = data;
  } catch (error) {
    evidence.cleanup = { error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeEvidence() {
  const outputPath = resolve(process.cwd(), '..', '..', 'artifacts', 'drawing-share-live-e2e.json');
  await mkdir(resolve(process.cwd(), '..', '..', 'artifacts'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(redactEvidence(evidence), null, 2)}\n`, 'utf8');
}

function redactEvidence(value) {
  return JSON.parse(JSON.stringify(value));
}
