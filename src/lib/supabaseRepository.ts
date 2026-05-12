// lib/supabaseRepository.ts
// ✅ FIXED v2 — Semua bug audit diperbaiki:
//   Bug 1: getUserStatistics → return key disesuaikan dengan admin page (total/active/inactive/recent/recentAdded)
//   Bug 3: addWhitelistUser → extra field diubah ke snake_case (user_id, device_id)
//   Bug 4: updateWhitelistUser → is_active dan last_login ikut diupdate
//   Bug 5: exportWhitelistAsJson & exportWhitelistAsCsv → trigger browser download langsung

import { supabase } from './supabase';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface WhitelistUser {
  id?: string;
  email: string;
  /** UI display name */
  name?: string;
  /** UI user identifier */
  userId?: string;
  /** UI device identifier */
  deviceId?: string;
  /** DB field: active status */
  is_active?: boolean;
  /** camelCase alias for UI convenience */
  isActive?: boolean;
  /** DB field: ISO timestamp string */
  added_at?: string;
  /** UI field: numeric timestamp (ms) derived from added_at */
  addedAt?: number;
  /** DB field: admin who added */
  added_by?: string;
  /** camelCase alias for UI convenience */
  addedBy?: string;
  /** UI field: creation timestamp (numeric ms, derived from added_at) */
  createdAt?: number;
  /** UI field: last login timestamp (numeric ms, derived from last_login) */
  lastLogin?: number;
  /** DB field: last login ISO timestamp */
  last_login?: string;
  /** UI field: FCM push token */
  fcmToken?: string;
  /** UI field: FCM token update timestamp */
  fcmTokenUpdatedAt?: number;
}

export interface AdminUser {
  id?: string;
  email: string;
  /** UI display name */
  name?: string;
  /** UI role: 'admin' | 'super_admin' */
  role?: 'admin' | 'super_admin';
  is_active?: boolean;
  created_at?: string;
}

export interface RegistrationConfig {
  minStockity?: number;
  maxRetries?: number;
  lockDuration?: number;
  maintenance?: boolean;
  /** UI field: Stockity registration URL */
  registrationUrl?: string;
  /** UI field: WhatsApp help URL */
  whatsappHelpUrl?: string;
  /** UI field: last updated timestamp (numeric ms) */
  updatedAt?: number;
}

export interface ImportResult {
  success: number;
  skipped: number;
}

// ─────────────────────────────────────────────
// WHITELIST USERS
// ─────────────────────────────────────────────

export async function getAllWhitelistUsers(
  _email?: string,
  _superAdmin?: boolean,
  _pageSize?: number,
): Promise<WhitelistUser[]> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[Supabase] getAllWhitelistUsers error:', error);
    throw new Error('Gagal memuat whitelist: ' + error.message);
  }

  return (data ?? []).map((row: any) => normalizeWhitelistUser(row));
}

export async function addWhitelistUser(
  emailOrUser: string | Omit<WhitelistUser, 'id'>,
  addedBy?: string,
): Promise<void> {
  let normalizedEmail: string;
  // ✅ FIX Bug 3: gunakan snake_case agar sesuai kolom Supabase
  let extra: Record<string, unknown> = {};

  if (typeof emailOrUser === 'string') {
    normalizedEmail = emailOrUser.toLowerCase().trim();
  } else {
    normalizedEmail = emailOrUser.email.toLowerCase().trim();
    extra = {
      name:      emailOrUser.name      ?? null,
      user_id:   emailOrUser.userId    ?? null,   // ✅ camelCase → snake_case
      device_id: emailOrUser.deviceId  ?? null,   // ✅ camelCase → snake_case
    };
  }

  const { error } = await supabase.from('whitelist_users').insert({
    email:     normalizedEmail,
    is_active: true,
    added_at:  new Date().toISOString(),
    added_by:  addedBy ?? 'system',
    ...extra,
  });

  if (error) {
    console.error('[Supabase] addWhitelistUser error:', error);
    throw new Error('Gagal menambahkan ke whitelist: ' + error.message);
  }
}

export async function updateWhitelistUser(
  oldEmailOrUser: string | WhitelistUser,
  newEmail?: string,
): Promise<void> {
  let oldEmail: string;
  let updateData: Record<string, unknown> = {};

  if (typeof oldEmailOrUser === 'string') {
    oldEmail = oldEmailOrUser;
    if (newEmail) updateData.email = newEmail.toLowerCase().trim();
  } else {
    // Called with full user object from admin page
    oldEmail = oldEmailOrUser.email;

    // Basic fields
    if (oldEmailOrUser.name      !== undefined) updateData.name      = oldEmailOrUser.name;
    if (oldEmailOrUser.userId    !== undefined) updateData.user_id   = oldEmailOrUser.userId;   // ✅ snake_case
    if (oldEmailOrUser.deviceId  !== undefined) updateData.device_id = oldEmailOrUser.deviceId; // ✅ snake_case
    if (oldEmailOrUser.email     !== undefined) updateData.email     = oldEmailOrUser.email.toLowerCase().trim();

    // ✅ FIX Bug 4: is_active dari checkbox "Nonaktifkan User"
    if (oldEmailOrUser.isActive !== undefined) {
      updateData.is_active = oldEmailOrUser.isActive;
    } else if (oldEmailOrUser.is_active !== undefined) {
      updateData.is_active = oldEmailOrUser.is_active;
    }

    // ✅ FIX Bug 4: last_login dari checkbox "Reset Recent Login"
    // lastLogin === 0 berarti di-reset → set null di DB
    // lastLogin > 0  berarti nilai asli → convert ke ISO string
    if (oldEmailOrUser.lastLogin !== undefined) {
      updateData.last_login =
        oldEmailOrUser.lastLogin === 0
          ? null
          : new Date(oldEmailOrUser.lastLogin).toISOString();
    }
  }

  const { error } = await supabase
    .from('whitelist_users')
    .update(updateData)
    .eq('email', oldEmail.toLowerCase().trim());

  if (error) {
    console.error('[Supabase] updateWhitelistUser error:', error);
    throw new Error('Gagal mengupdate whitelist user: ' + error.message);
  }
}

export async function toggleWhitelistUserStatus(
  emailOrUser: string | WhitelistUser,
  isActive?: boolean,
): Promise<void> {
  let email: string;
  let active: boolean;

  if (typeof emailOrUser === 'string') {
    email  = emailOrUser;
    active = isActive ?? true;
  } else {
    // Toggle current state — gunakan is_active (DB) atau isActive (UI alias)
    email  = emailOrUser.email;
    const current = emailOrUser.is_active ?? emailOrUser.isActive ?? true;
    active = !current;
  }

  const { error } = await supabase
    .from('whitelist_users')
    .update({ is_active: active })
    .eq('email', email.toLowerCase().trim());

  if (error) {
    console.error('[Supabase] toggleWhitelistUserStatus error:', error);
    throw new Error('Gagal mengupdate status whitelist: ' + error.message);
  }
}

export async function deleteWhitelistUser(emailOrId: string): Promise<void> {
  const normalized = emailOrId.toLowerCase().trim();

  // Try by email first, fallback to id
  const { error: emailErr } = await supabase
    .from('whitelist_users')
    .delete()
    .eq('email', normalized);

  if (emailErr) {
    const { error: idErr } = await supabase
      .from('whitelist_users')
      .delete()
      .eq('id', emailOrId);

    if (idErr) {
      console.error('[Supabase] deleteWhitelistUser error:', idErr);
      throw new Error('Gagal menghapus dari whitelist: ' + idErr.message);
    }
  }
}

export async function importWhitelistUsers(
  emailsOrUsers: string[] | any[],
  addedBy?: string,
): Promise<ImportResult> {
  if (emailsOrUsers.length === 0) return { success: 0, skipped: 0 };

  let success = 0;
  let skipped = 0;

  const isStringArray = typeof emailsOrUsers[0] === 'string';

  if (isStringArray) {
    const rows = (emailsOrUsers as string[]).map(e => ({
      email:     e.toLowerCase().trim(),
      is_active: true,
      added_at:  new Date().toISOString(),
      added_by:  addedBy ?? 'system',
    }));

    const { error } = await supabase.from('whitelist_users').insert(rows);
    if (error) {
      console.error('[Supabase] importWhitelistUsers error:', error);
      throw new Error('Gagal import whitelist: ' + error.message);
    }
    success = rows.length;
  } else {
    // Array of user objects from JSON import
    const rows = (emailsOrUsers as any[]).map(u => {
      const email = ((u.email ?? '') as string).toLowerCase().trim();
      return {
        email,
        is_active:  u.isActive   ?? u.is_active   ?? true,
        added_at:   u.createdAt  ? new Date(u.createdAt).toISOString()  : new Date().toISOString(),
        added_by:   addedBy      ?? u.addedBy      ?? u.added_by        ?? 'system',
        name:       u.name       ?? null,
        user_id:    u.userId     ?? u.user_id      ?? null,  // ✅ snake_case
        device_id:  u.deviceId   ?? u.device_id    ?? null,  // ✅ snake_case
        last_login: u.lastLogin  ? new Date(u.lastLogin).toISOString() : null,
      };
    }).filter(r => r.email);

    for (const row of rows) {
      const { error } = await supabase.from('whitelist_users').insert(row);
      if (error) skipped++;
      else success++;
    }
  }

  return { success, skipped };
}

// ✅ FIX Bug 5: langsung trigger browser download — tidak lagi return string
export function exportWhitelistAsJson(users: WhitelistUser[]): void {
  const json = JSON.stringify(users, null, 2);
  triggerDownload(
    new Blob([json], { type: 'application/json' }),
    `whitelist-${isoDate()}.json`,
  );
}

// ✅ FIX Bug 5: langsung trigger browser download — tidak lagi return string
export function exportWhitelistAsCsv(users: WhitelistUser[]): void {
  const header = 'email,name,user_id,device_id,is_active,added_at,added_by,last_login';
  const rows = users.map(u =>
    [
      u.email,
      escapeCsv(u.name       ?? ''),
      escapeCsv(u.userId     ?? ''),
      escapeCsv(u.deviceId   ?? ''),
      u.isActive ?? u.is_active ?? true,
      u.added_at  ?? '',
      escapeCsv(u.addedBy    ?? u.added_by ?? ''),
      u.last_login ?? '',
    ].join(',')
  );
  triggerDownload(
    new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `whitelist-${isoDate()}.csv`,
  );
}

export async function getWhitelistUserByEmail(email: string): Promise<WhitelistUser | null> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('[Supabase] getWhitelistUserByEmail error:', error);
    return null;
  }
  return data ? normalizeWhitelistUser(data) : null;
}

export async function getWhitelistUserByUserId(userId: string): Promise<WhitelistUser | null> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const { data: byEmail, error: emailErr } = await supabase
      .from('whitelist_users')
      .select('*')
      .eq('email', userId.toLowerCase().trim())
      .maybeSingle();
    if (emailErr) return null;
    return byEmail ? normalizeWhitelistUser(byEmail) : null;
  }
  return data ? normalizeWhitelistUser(data) : null;
}

export async function updateLastLogin(email: string): Promise<void> {
  const { error } = await supabase
    .from('whitelist_users')
    .update({ last_login: new Date().toISOString() })
    .eq('email', email.toLowerCase().trim());

  if (error) {
    console.error('[Supabase] updateLastLogin error:', error);
  }
}

export async function isWhitelisted(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] isWhitelisted error:', error);
    return false;
  }
  return !!data;
}

export async function checkWhitelist(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('[Supabase] checkWhitelist error:', error);
    return false;
  }
  return !!data;
}

// ─────────────────────────────────────────────
// ADMIN USERS
// ─────────────────────────────────────────────

export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase] getAdminUsers error:', error);
    throw new Error('Gagal memuat admin: ' + error.message);
  }

  return (data ?? []).map((row: any) => ({
    id:         row.id,
    email:      row.email,
    name:       row.name || row.email.split('@')[0],
    role:       (row.role as 'admin' | 'super_admin') || 'admin',
    is_active:  row.is_active,
    created_at: row.created_at,
  }));
}

export async function addAdminUser(
  email: string,
  name?: string,
  role?: string,
  _addedBy?: string,
): Promise<void> {
  const { error } = await supabase.from('admin_users').insert({
    email:      email.toLowerCase().trim(),
    name:       name ?? email.split('@')[0],
    role:       role ?? 'admin',
    is_active:  true,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[Supabase] addAdminUser error:', error);
    throw new Error('Gagal menambahkan admin: ' + error.message);
  }
}

export async function removeAdminUser(emailOrId: string): Promise<void> {
  const normalized = emailOrId.toLowerCase().trim();

  const { error: emailErr } = await supabase
    .from('admin_users')
    .delete()
    .eq('email', normalized);

  if (emailErr) {
    const { error: idErr } = await supabase
      .from('admin_users')
      .delete()
      .eq('id', emailOrId);

    if (idErr) {
      console.error('[Supabase] removeAdminUser error:', idErr);
      throw new Error('Gagal menghapus admin: ' + idErr.message);
    }
  }
}

export async function checkIsAdmin(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] checkIsAdmin error:', error);
    return false;
  }
  return !!data;
}

// ─────────────────────────────────────────────
// SUPER ADMIN
// ─────────────────────────────────────────────

export async function getAllSuperAdmins(): Promise<{ id?: string; email: string; created_at?: string }[]> {
  const { data, error } = await supabase
    .from('super_admins')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase] getAllSuperAdmins error:', error);
    throw new Error('Gagal memuat super admin: ' + error.message);
  }
  return (data ?? []) as { id?: string; email: string; created_at?: string }[];
}

export async function addSuperAdmin(email: string): Promise<void> {
  const { error } = await supabase.from('super_admins').insert({
    email:      email.toLowerCase().trim(),
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[Supabase] addSuperAdmin error:', error);
    throw new Error('Gagal menambahkan super admin: ' + error.message);
  }
}

export async function deleteSuperAdmin(email: string): Promise<void> {
  const { error } = await supabase
    .from('super_admins')
    .delete()
    .eq('email', email.toLowerCase().trim());

  if (error) {
    console.error('[Supabase] deleteSuperAdmin error:', error);
    throw new Error('Gagal menghapus super admin: ' + error.message);
  }
}

export async function checkIsSuperAdmin(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('super_admins')
    .select('email')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('[Supabase] checkIsSuperAdmin error:', error);
    return false;
  }
  return !!data;
}

// ─────────────────────────────────────────────
// APP CONFIG / REGISTRATION CONFIG
// ─────────────────────────────────────────────

export async function getAppConfig(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from('app_config').select('*');
  if (error) {
    console.error('[Supabase] getAppConfig error:', error);
    throw new Error('Gagal memuat app config: ' + error.message);
  }
  return (data ?? []) as Record<string, unknown>[];
}

export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value, updated_at')
    .eq('key', 'registration')
    .maybeSingle();

  const defaults: RegistrationConfig = {
    minStockity:     100000,
    maxRetries:      3,
    lockDuration:    24,
    maintenance:     false,
    registrationUrl: '',
    whatsappHelpUrl: '',
    updatedAt:       0,
  };

  if (error || !data?.value) return defaults;

  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return {
      minStockity:     v.minStockity     ?? 100000,
      maxRetries:      v.maxRetries      ?? 3,
      lockDuration:    v.lockDuration    ?? 24,
      maintenance:     v.maintenance     ?? false,
      registrationUrl: v.registrationUrl ?? '',
      whatsappHelpUrl: v.whatsappHelpUrl ?? '',
      updatedAt:       data.updated_at
        ? new Date(data.updated_at).getTime()
        : v.updatedAt ?? 0,
    };
  } catch {
    return defaults;
  }
}

export async function updateRegistrationConfig(
  configOrField: Partial<RegistrationConfig> | string,
  val?: string,
): Promise<void> {
  let merged: RegistrationConfig;

  if (typeof configOrField === 'string' && val !== undefined) {
    // Called as updateRegistrationConfig(field, val) from admin page
    const current = await getRegistrationConfig();
    merged = { ...current, [configOrField]: val };
  } else {
    const current = await getRegistrationConfig();
    merged = { ...current, ...(configOrField as Partial<RegistrationConfig>) };
  }

  const { error } = await supabase.from('app_config').upsert(
    {
      key:        'registration',
      value:      JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );

  if (error) {
    console.error('[Supabase] updateRegistrationConfig error:', error);
    throw new Error('Gagal mengupdate config: ' + error.message);
  }
}

// ─────────────────────────────────────────────
// USER STATISTICS
// ✅ FIX Bug 1: return key disesuaikan dengan yang dipakai admin page
//    Sebelum: totalUsers / activeUsers / todayUsers / weekUsers
//    Sesudah: total / active / inactive / recent / recentAdded
// ─────────────────────────────────────────────

export async function getUserStatistics(
  _email?: string,
  _superAdmin?: boolean,
): Promise<{
  total:        number;
  active:       number;
  inactive:     number;
  recent:       number;
  recentAdded:  number;
}> {
  const threshold24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Jalankan semua count query secara paralel untuk efisiensi
  const [
    { count: total },
    { count: active },
    { count: inactive },
    { count: recent },
    { count: recentAdded },
  ] = await Promise.all([
    // Total semua user whitelist
    supabase
      .from('whitelist_users')
      .select('*', { count: 'exact', head: true }),

    // User yang aktif
    supabase
      .from('whitelist_users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),

    // ✅ User yang tidak aktif (dulu tidak dihitung)
    supabase
      .from('whitelist_users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', false),

    // ✅ User yang login dalam 24 jam terakhir (dulu tidak dihitung)
    supabase
      .from('whitelist_users')
      .select('*', { count: 'exact', head: true })
      .gte('last_login', threshold24h),

    // ✅ User yang baru ditambahkan dalam 24 jam terakhir (dulu tidak dihitung)
    supabase
      .from('whitelist_users')
      .select('*', { count: 'exact', head: true })
      .gte('added_at', threshold24h),
  ]);

  return {
    total:       total       ?? 0,
    active:      active      ?? 0,
    inactive:    inactive    ?? 0,
    recent:      recent      ?? 0,
    recentAdded: recentAdded ?? 0,
  };
}

export async function getAllUsersForStats(
  _email?: string,
  _superAdmin?: boolean,
): Promise<
  { uid: string; email: string; firstLogin: string | null; lastLogin: string | null; totalTrades: number }[]
> {
  const { data, error } = await supabase
    .from('whitelist_users')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[Supabase] getAllUsersForStats error:', error);
    return [];
  }

  return (data ?? []).map((u: any) => ({
    uid:         u.id    ?? u.email,
    email:       u.email,
    firstLogin:  u.added_at   ?? null,
    lastLogin:   u.last_login ?? u.added_at ?? null,
    totalTrades: 0,
  }));
}

// ─────────────────────────────────────────────
// REMOTE CONFIG / WEB SOCKET URL
// ─────────────────────────────────────────────

export async function getWebSocketUrl(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'ws_url')
    .maybeSingle();

  if (error || !data) return null;
  return (data.value as string | null) ?? null;
}

export async function updateWebSocketUrl(url: string): Promise<void> {
  const { error } = await supabase.from('app_config').upsert(
    { key: 'ws_url', value: url, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) {
    console.error('[Supabase] updateWebSocketUrl error:', error);
    throw new Error('Gagal mengupdate WS URL: ' + error.message);
  }
}

export async function getRemoteConfig(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('app_config')
    .select('*')
    .eq('key', 'singleton')
    .maybeSingle();

  if (error || !data) return {};
  try {
    if (typeof data.value === 'string') return JSON.parse(data.value);
    return (data.value as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────
// REALTIME SUBSCRIPTION
// ─────────────────────────────────────────────

export function subscribeToTable(table: string, callback: (payload: any) => void) {
  return supabase
    .channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
}

// ─────────────────────────────────────────────
// HELPERS (private)
// ─────────────────────────────────────────────

/** Normalize a DB row into a WhitelistUser with both snake_case and camelCase fields */
function normalizeWhitelistUser(row: any): WhitelistUser {
  const addedAtMs   = row.added_at   ? new Date(row.added_at).getTime()   : undefined;
  const lastLoginMs = row.last_login ? new Date(row.last_login).getTime() : undefined;

  return {
    // DB fields (snake_case)
    id:         row.id,
    email:      row.email,
    is_active:  row.is_active,
    added_at:   row.added_at,
    added_by:   row.added_by,
    last_login: row.last_login,
    // UI camelCase aliases
    isActive:   row.is_active,
    addedAt:    addedAtMs,
    addedBy:    row.added_by,
    createdAt:  addedAtMs,
    lastLogin:  lastLoginMs,
    // Optional extended fields
    name:       row.name      ?? undefined,
    userId:     row.user_id   ?? undefined,
    deviceId:   row.device_id ?? undefined,
  };
}

/** Format today's date as YYYY-MM-DD for filenames */
function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Escape a value for CSV (wrap in quotes if contains comma, newline, or quote) */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Trigger a browser file download */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke setelah delay kecil agar browser sempat mulai download
  setTimeout(() => URL.revokeObjectURL(url), 500);
}