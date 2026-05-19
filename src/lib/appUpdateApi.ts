// lib/appUpdateApi.ts
// ✅ v4 — FULLY AUTOMATIC: deteksi versi dari nama file APK di bucket.
//
// Tidak perlu version.json, tidak perlu app_config, tidak perlu isi apapun manual.
// Cukup upload APK dengan format nama:
//
//   app-v{versionName}-code{versionCode}.apk
//   contoh: app-v1.2.0-code2.apk
//
// Sistem otomatis:
//   1. List semua file di folder "releases/" dalam bucket "apk-releases"
//   2. Parse versionCode dari nama file
//   3. Ambil file dengan versionCode tertinggi sebagai "versi terbaru"
//   4. Bandingkan dengan APP_VERSION_CODE di device
//   5. Jika ada yang lebih baru → tampilkan notifikasi update

import { supabase } from './supabase';
import { APP_VERSION_CODE, APP_VERSION_NAME } from './appVersion';

const APK_BUCKET  = 'apk-releases';
const APK_FOLDER  = 'releases';

// Format nama file: app-v1.2.0-code2.apk
// Regex: tangkap versionName dan versionCode dari nama file
const APK_FILENAME_REGEX = /^app-v(.+)-code(\d+)\.apk$/;

// ── Types ──────────────────────────────────────────────────────────────────

export interface AppVersionInfo {
  versionCode:  number;
  versionName:  string;
  /** Path lengkap di bucket, contoh: "releases/app-v1.2.0-code2.apk" */
  apkPath:      string;
  /** Public URL APK, langsung bisa dibuka */
  downloadUrl:  string;
  releaseNotes: string;  // selalu kosong — tidak ada metadata manual
  isMandatory:  boolean; // selalu false — tidak ada metadata manual
}

export interface UpdateCheckResult {
  currentVersionCode:  number;
  currentVersionName:  string;
  latest:              AppVersionInfo | null;
  hasUpdate:           boolean;
  isMandatory:         boolean;
  resolvedDownloadUrl: string | null;
  error:               string | null;
}

// ── parseApkFilename ────────────────────────────────────────────────────────
// "app-v1.2.0-code2.apk" → { versionName: "1.2.0", versionCode: 2 }
// Kembalikan null jika nama file tidak sesuai format.
function parseApkFilename(filename: string): { versionName: string; versionCode: number } | null {
  const match = filename.match(APK_FILENAME_REGEX);
  if (!match) return null;
  return {
    versionName: match[1],
    versionCode: Number(match[2]),
  };
}

// ── getLatestApkFromBucket ──────────────────────────────────────────────────
// List semua file di folder "releases/", cari yang punya versionCode tertinggi.
async function getLatestApkFromBucket(): Promise<AppVersionInfo | null> {
  const { data: files, error } = await supabase.storage
    .from(APK_BUCKET)
    .list(APK_FOLDER, { sortBy: { column: 'name', order: 'asc' } });

  if (error || !files?.length) {
    console.warn('[AppUpdate] Gagal list bucket atau bucket kosong:', error?.message);
    return null;
  }

  // Filter hanya file APK yang sesuai format nama, lalu cari versionCode tertinggi
  let latest: AppVersionInfo | null = null;

  for (const file of files) {
    const parsed = parseApkFilename(file.name);
    if (!parsed) continue; // skip file dengan nama tidak sesuai format

    if (!latest || parsed.versionCode > latest.versionCode) {
      const apkPath = `${APK_FOLDER}/${file.name}`;

      const { data: urlData } = supabase.storage
        .from(APK_BUCKET)
        .getPublicUrl(apkPath);

      if (!urlData?.publicUrl) continue;

      latest = {
        versionCode:  parsed.versionCode,
        versionName:  parsed.versionName,
        apkPath,
        downloadUrl:  urlData.publicUrl,
        releaseNotes: '',
        isMandatory:  false,
      };
    }
  }

  return latest;
}

// ── checkForUpdate ──────────────────────────────────────────────────────────
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = {
    currentVersionCode:  APP_VERSION_CODE,
    currentVersionName:  APP_VERSION_NAME,
    latest:              null,
    hasUpdate:           false,
    isMandatory:         false,
    resolvedDownloadUrl: null,
    error:               null,
  };

  try {
    const latest = await getLatestApkFromBucket();

    if (!latest) {
      return { ...base, error: 'Versi sudah terbaru, tidak ada pembaruan saat ini.' };
    }

    const hasUpdate = latest.versionCode > APP_VERSION_CODE;

    return {
      ...base,
      latest,
      hasUpdate,
      isMandatory:         false, // tidak ada metadata manual
      resolvedDownloadUrl: hasUpdate ? latest.downloadUrl : null,
    };
  } catch (e) {
    console.error('[AppUpdate] checkForUpdate error:', e);
    return {
      ...base,
      error: 'Gagal memeriksa pembaruan. Periksa koneksi internet Anda.',
    };
  }
}