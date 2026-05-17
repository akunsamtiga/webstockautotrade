// lib/appVersion.ts
// ✅ Update nilai ini SETIAP KALI build APK baru.
//    versionCode  : integer, selalu naik (dipakai untuk perbandingan)
//    versionName  : string display (ditampilkan ke user)
//
// Cara kerja update:
//   1. Naikkan versionCode dan versionName di sini sebelum build
//   2. Upload APK ke storage (Google Drive, S3, dll)
//   3. Update row app_config di Supabase:
//        key = 'app_version'
//        value = { "versionCode": <baru>, "versionName": "...", "downloadUrl": "...", ... }

export const APP_VERSION_CODE = 3;   // integer — naikan setiap rilis
export const APP_VERSION_NAME = '3.0'; // string display

// 1. Build APK baru
// 2. Naikkan APP_VERSION_CODE di appVersion.ts → 2, APP_VERSION_NAME → "2.0"  
// 3. Build & deploy app
// 4. Upload ke bucket: app-v2.0-code2.apk