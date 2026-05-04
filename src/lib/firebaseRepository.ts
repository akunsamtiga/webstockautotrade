// lib/firebaseRepository.ts

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
  serverTimestamp,
  Firestore,
  limit,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { getRemoteConfig, fetchAndActivate, getValue, RemoteConfig } from 'firebase/remote-config';

const FIREBASE_CONFIG = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// ── Collection names — HARUS sama dengan Kotlin FirebaseRepository.kt ─────────
// Kotlin: whitelist_users, app_config, admin_users
const COLLECTION_WHITELIST = 'whitelist_users';  // ✅ FIXED: was 'whitelist'
const COLLECTION_CONFIG    = 'app_config';        // ✅ FIXED: was 'config'
const COLLECTION_ADMIN     = 'admin_users';
const CONFIG_DOC_ID        = 'registration_config'; // ✅ FIXED: was 'registration'

let app: FirebaseApp;
let db: Firestore;
let remoteConfig: RemoteConfig | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!app) app = getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  return app;
}

function getDb(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

async function getRemoteCfg(): Promise<RemoteConfig> {
  if (!remoteConfig) {
    remoteConfig = getRemoteConfig(getFirebaseApp());
    remoteConfig.settings.minimumFetchIntervalMillis = 3_600_000;
    await fetchAndActivate(remoteConfig).catch(() => {});
  }
  return remoteConfig;
}

// ── sanitizeDocId — HARUS identik dengan Kotlin: ─────────────────────────────
// Kotlin: userId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
// ✅ FIXED: versi lama tidak ada fungsi ini → doc ID acak → tidak konsisten
export function sanitizeDocId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistrationConfig {
  registrationUrl: string;
  whatsappHelpUrl: string;
}

export interface WhitelistUser {
  id:                 string;
  email:              string;
  name:               string;
  userId:             string;
  deviceId:           string;
  isActive:           boolean;
  createdAt:          number;
  lastLogin:          number;
  addedBy:            string;
  addedAt:            number;    // ✅ FIXED: field ini ada di Kotlin tapi missing di TS lama
  fcmToken:           string;    // ✅ FIXED: field ini ada di Kotlin tapi missing di TS lama
  fcmTokenUpdatedAt:  number;    // ✅ FIXED: field ini ada di Kotlin tapi missing di TS lama
}

const DEFAULT_CONFIG: RegistrationConfig = {
  registrationUrl: 'https://stockity.id/registered?a=25db72fbbc00',
  whatsappHelpUrl: 'https://wa.me/6285959860015',
  updatedAt:       0,
};

// ── getRegistrationConfig ─────────────────────────────────────────────────────
// Mirrors: FirebaseRepository.getRegistrationConfig()
// Collection: app_config / document: registration_config
export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  try {
    const snap = await getDoc(doc(getDb(), COLLECTION_CONFIG, CONFIG_DOC_ID));
    if (snap.exists()) {
      const d = snap.data();
      return {
        registrationUrl: d.registrationUrl ?? DEFAULT_CONFIG.registrationUrl,
        whatsappHelpUrl: d.whatsappHelpUrl  ?? DEFAULT_CONFIG.whatsappHelpUrl,
        updatedAt:       d.updatedAt ?? 0,
      };
    }
  } catch (e) {
    console.error('[Firebase] getRegistrationConfig Firestore error:', e);
  }

  // Fallback ke Remote Config
  try {
    const rc = await getRemoteCfg();
    const regUrl = getValue(rc, 'registration_url').asString();
    const waUrl  = getValue(rc, 'whatsapp_help_url').asString();
    if (regUrl || waUrl) return {
      registrationUrl: regUrl || DEFAULT_CONFIG.registrationUrl,
      whatsappHelpUrl: waUrl  || DEFAULT_CONFIG.whatsappHelpUrl,
      updatedAt:       0,
    };
  } catch {}

  return DEFAULT_CONFIG;
}

// ── getWhitelistUserByEmail ───────────────────────────────────────────────────
// Mirrors: FirebaseRepository.getWhitelistUserByEmail()
// Collection: whitelist_users
export async function getWhitelistUserByEmail(email: string): Promise<WhitelistUser | null> {
  try {
    const q    = query(
      collection(getDb(), COLLECTION_WHITELIST),
      where('email', '==', email.toLowerCase().trim()),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as WhitelistUser;
  } catch (e) { console.error('[Firebase] getWhitelistUserByEmail:', e); }
  return null;
}

// ── getWhitelistUserByUserId ──────────────────────────────────────────────────
// Mirrors: FirebaseRepository.getWhitelistUserByUserId()
export async function getWhitelistUserByUserId(userId: string): Promise<WhitelistUser | null> {
  try {
    const q    = query(
      collection(getDb(), COLLECTION_WHITELIST),
      where('userId', '==', userId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as WhitelistUser;
  } catch (e) { console.error('[Firebase] getWhitelistUserByUserId:', e); }
  return null;
}

// ── updateLastLogin ───────────────────────────────────────────────────────────
// Mirrors: FirebaseRepository.updateLastLogin()
// Query by field userId, update field lastLogin
export async function updateLastLogin(userId: string): Promise<void> {
  try {
    const q    = query(
      collection(getDb(), COLLECTION_WHITELIST),
      where('userId', '==', userId),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      await updateDoc(snap.docs[0].ref, {
        lastLogin: Date.now(),
        updatedAt: serverTimestamp(),
      });
    } else {
      console.warn('[Firebase] updateLastLogin: user not found for userId=', userId);
    }
  } catch (e) { console.error('[Firebase] updateLastLogin:', e); }
}

// ── addWhitelistUser ──────────────────────────────────────────────────────────
// ✅ FIXED — Port 1:1 dari FirebaseRepository.addWhitelistUser()
//
// PERUBAHAN KRITIS:
//   1. Document ID = sanitizeDocId(user.userId) — bukan random UUID
//   2. Cek duplikat via getDoc() sebelum set() — throw jika sudah ada
//   3. Semua field disertakan termasuk addedAt, fcmToken, fcmTokenUpdatedAt
export async function addWhitelistUser(
  user: Omit<WhitelistUser, 'id'>,
  addedBy = 'web_registration'
): Promise<string> {
  if (!user.userId) {
    throw new Error('userId tidak boleh kosong');
  }

  // ✅ FIXED: Gunakan sanitizeDocId — sama dengan Kotlin
  const docId = sanitizeDocId(user.userId);

  // ✅ FIXED: Cek duplikat dulu — sama dengan Kotlin
  const existingDoc = await getDoc(doc(getDb(), COLLECTION_WHITELIST, docId));
  if (existingDoc.exists()) {
    throw new Error(`User dengan ID "${user.userId}" sudah terdaftar`);
  }

  const now = Date.now();

  // ✅ FIXED: Semua field sama persis dengan Kotlin addWhitelistUser()
  const userData = {
    id:                docId,
    email:             user.email,
    name:              user.name,
    userId:            user.userId,
    deviceId:          user.deviceId ?? '',
    isActive:          true,
    createdAt:         user.createdAt || now,
    lastLogin:         user.lastLogin || now,
    addedBy:           addedBy,
    addedAt:           now,           // ✅ FIXED: was missing
    fcmToken:          '',            // ✅ FIXED: was missing
    fcmTokenUpdatedAt: 0,             // ✅ FIXED: was missing
  };

  await setDoc(doc(getDb(), COLLECTION_WHITELIST, docId), userData);
  return docId;
}

// ── checkIsAdmin ──────────────────────────────────────────────────────────────
// Mirrors: FirebaseRepository.checkIsAdmin()
// Collection: admin_users
export async function checkIsAdmin(email: string): Promise<boolean> {
  try {
    const q = query(
      collection(getDb(), COLLECTION_ADMIN),
      where('email', '==', email),
      where('isActive', '==', true),
      limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (e) {
    console.error('[Firebase] checkIsAdmin:', e);
    return false;
  }
}
// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PANEL FUNCTIONS — Mirror dari AdminViewModel / FirebaseRepository.kt
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminUser {
  id:        string;
  email:     string;
  name:      string;
  role:      string;        // 'super_admin' | 'admin'
  isActive:  boolean;
  addedBy:   string;
  addedAt:   number;
  createdAt: number;
}

export interface RegistrationConfig {
  registrationUrl: string;
  whatsappHelpUrl: string;
  updatedAt?:      number;   // optional — not always stored in Firestore
}

const COLLECTION_SUPER_ADMIN = 'super_admins';

// ── checkIsSuperAdmin ──────────────────────────────────────────────────────
export async function checkIsSuperAdmin(email: string): Promise<boolean> {
  try {
    const q = query(
      collection(getDb(), COLLECTION_SUPER_ADMIN),
      where('email', '==', email),
      where('isActive', '==', true),
      limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch {
    return false;
  }
}

// ── getUserStatistics ──────────────────────────────────────────────────────
// Mirrors: FirebaseRepository.getUserStatistics()
export async function getUserStatistics(
  adminEmail: string,
  isSuperAdmin: boolean
): Promise<Record<string, number>> {
  try {
    const threshold24h = Date.now() - 24 * 60 * 60 * 1000;

    let q;
    if (isSuperAdmin) {
      q = query(collection(getDb(), COLLECTION_WHITELIST), orderBy('createdAt', 'desc'));
    } else {
      q = query(
        collection(getDb(), COLLECTION_WHITELIST),
        where('addedBy', '==', adminEmail),
        orderBy('createdAt', 'desc')
      );
    }

    const snap = await getDocs(q);
    const users = snap.docs.map(d => d.data() as WhitelistUser);

    return {
      total:       users.length,
      active:      users.filter(u => u.isActive).length,
      inactive:    users.filter(u => !u.isActive).length,
      recent:      users.filter(u => u.lastLogin > threshold24h).length,
      recentAdded: users.filter(u => u.createdAt > threshold24h && u.addedBy === 'web_registration').length,
    };
  } catch {
    return { total: 0, active: 0, inactive: 0, recent: 0, recentAdded: 0 };
  }
}

// ── getAllWhitelistUsers ───────────────────────────────────────────────────
// Mirrors: FirebaseRepository.getWhitelistUsers()
export async function getAllWhitelistUsers(
  adminEmail: string,
  isSuperAdmin: boolean,
  pageLimit = 50
): Promise<WhitelistUser[]> {
  try {
    let q;
    if (isSuperAdmin) {
      q = query(
        collection(getDb(), COLLECTION_WHITELIST),
        orderBy('createdAt', 'desc'),
        limit(pageLimit)
      );
    } else {
      q = query(
        collection(getDb(), COLLECTION_WHITELIST),
        where('addedBy', '==', adminEmail),
        orderBy('createdAt', 'desc'),
        limit(pageLimit)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as WhitelistUser));
  } catch (e) {
    console.error('[Firebase] getAllWhitelistUsers:', e);
    return [];
  }
}

// ── getAllUsersForStats ────────────────────────────────────────────────────
export async function getAllUsersForStats(
  adminEmail: string,
  isSuperAdmin: boolean
): Promise<WhitelistUser[]> {
  return getAllWhitelistUsers(adminEmail, isSuperAdmin, 1000);
}

// ── updateWhitelistUser ───────────────────────────────────────────────────
// Mirrors: FirebaseRepository.updateWhitelistUser()
export async function updateWhitelistUser(user: WhitelistUser): Promise<void> {
  const docId = sanitizeDocId(user.userId);
  await updateDoc(doc(getDb(), COLLECTION_WHITELIST, docId), {
    name:      user.name,
    email:     user.email,
    userId:    user.userId,
    deviceId:  user.deviceId,
    addedBy:   user.addedBy,
    isActive:  user.isActive,
    lastLogin: user.lastLogin,
    updatedAt: serverTimestamp(),
  });
}

// ── deleteWhitelistUser ───────────────────────────────────────────────────
export async function deleteWhitelistUser(docId: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(getDb(), COLLECTION_WHITELIST, docId));
}

// ── toggleWhitelistUserStatus ─────────────────────────────────────────────
export async function toggleWhitelistUserStatus(user: WhitelistUser): Promise<void> {
  const docId = sanitizeDocId(user.userId);
  await updateDoc(doc(getDb(), COLLECTION_WHITELIST, docId), {
    isActive:  !user.isActive,
    updatedAt: serverTimestamp(),
  });
}

// ── importWhitelistUsers ──────────────────────────────────────────────────
export async function importWhitelistUsers(
  users: Omit<WhitelistUser, 'id'>[],
  addedBy = 'web_import'
): Promise<{ success: number; skipped: number; errors: string[] }> {
  let success = 0, skipped = 0;
  const errors: string[] = [];
  const batch = writeBatch(getDb());

  for (const user of users) {
    try {
      if (!user.userId) { skipped++; continue; }
      const docId = sanitizeDocId(user.userId);
      const ref = doc(getDb(), COLLECTION_WHITELIST, docId);
      const existing = await getDoc(ref);
      if (existing.exists()) { skipped++; continue; }
      batch.set(ref, {
        ...user,
        id: docId,
        addedBy,
        addedAt: Date.now(),
        fcmToken: '',
        fcmTokenUpdatedAt: 0,
      });
      success++;
    } catch (e: any) {
      errors.push(`${user.email}: ${e.message}`);
    }
  }

  await batch.commit();
  return { success, skipped, errors };
}

// ── getAdminUsers ─────────────────────────────────────────────────────────
export async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const snap = await getDocs(
      query(collection(getDb(), COLLECTION_ADMIN), orderBy('addedAt', 'desc'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminUser));
  } catch { return []; }
}

// ── addAdminUser ──────────────────────────────────────────────────────────
export async function addAdminUser(
  email: string, name: string, role: string, addedBy: string
): Promise<void> {
  const docId = email.replace(/[^a-zA-Z0-9_-]/g, '_');
  await setDoc(doc(getDb(), COLLECTION_ADMIN, docId), {
    id: docId, email, name, role,
    isActive: true,
    addedBy,
    addedAt:   Date.now(),
    createdAt: Date.now(),
  });
}

// ── removeAdminUser ───────────────────────────────────────────────────────
export async function removeAdminUser(docId: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(getDb(), COLLECTION_ADMIN, docId));
}

// ── updateRegistrationConfig ──────────────────────────────────────────────
export async function updateRegistrationConfig(
  field: 'registrationUrl' | 'whatsappHelpUrl',
  value: string
): Promise<void> {
  await updateDoc(doc(getDb(), COLLECTION_CONFIG, CONFIG_DOC_ID), {
    [field]:   value,
    updatedAt: serverTimestamp(),
  });
}

// ── exportWhitelistAsJson ─────────────────────────────────────────────────
export function exportWhitelistAsJson(users: WhitelistUser[]): void {
  const blob = new Blob([JSON.stringify(users, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `whitelist_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── exportWhitelistAsCsv ──────────────────────────────────────────────────
export function exportWhitelistAsCsv(users: WhitelistUser[]): void {
  const headers = ['id','name','email','userId','deviceId','isActive','createdAt','lastLogin','addedBy','addedAt'];
  const rows = users.map(u =>
    headers.map(h => {
      const v = (u as any)[h];
      if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
      return v ?? '';
    }).join(',')
  );
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `whitelist_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}