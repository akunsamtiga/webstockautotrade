'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { storage, isSessionValid } from '@/lib/storage';
import {
  checkIsAdmin, checkIsSuperAdmin, getUserStatistics, getAllWhitelistUsers,
  getAllUsersForStats, addWhitelistUser, updateWhitelistUser, deleteWhitelistUser,
  toggleWhitelistUserStatus, importWhitelistUsers, getAdminUsers, addAdminUser,
  removeAdminUser, updateRegistrationConfig, getRegistrationConfig,
  exportWhitelistAsJson, exportWhitelistAsCsv,
  type WhitelistUser, type AdminUser, type RegistrationConfig,
} from '@/lib/supabaseRepository';

// ══════════════════════════════════════════════════════
// DESIGN TOKENS — Light Theme (clean & minimal)
// ══════════════════════════════════════════════════════
const C = {
  bg:        '#F4F6F9',
  card:      '#FFFFFF',
  cardHover: '#F8FAFC',
  accent:    '#0891B2',
  accentD:   'rgba(8,145,178,0.09)',
  text:      '#1E293B',
  sub:       '#475569',
  muted:     '#94A3B8',
  success:   '#059669',
  successD:  'rgba(5,150,105,0.09)',
  error:     '#DC2626',
  errorD:    'rgba(220,38,38,0.09)',
  warn:      '#D97706',
  warnD:     'rgba(217,119,6,0.09)',
  info:      '#2563EB',
  infoD:     'rgba(37,99,235,0.09)',
  bdr:       '#E2E8F0',
};

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function fmtDate(ts: number, showTime = false): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const base = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (!showTime) return base;
  return `${base} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtShortDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ══════════════════════════════════════════════════════
// PRIMITIVE COMPONENTS
// ══════════════════════════════════════════════════════
const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = C.accent }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    border: `2px solid ${color}30`,
    borderTopColor: color,
    animation: 'admin-spin 0.7s linear infinite',
    flexShrink: 0,
  }} />
);

const Badge: React.FC<{ label: string; color: string; bg: string }> = ({ label, color, bg }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
    padding: '2px 8px', borderRadius: 99,
    color, background: bg,
  }}>{label}</span>
);

const ABtn: React.FC<{
  children: React.ReactNode; color?: string; bg?: string; onClick?: () => void;
  disabled?: boolean; full?: boolean; outline?: boolean; small?: boolean;
}> = ({ children, color = '#fff', bg = C.accent, onClick, disabled, full, outline, small }) => (
  <button
    onClick={onClick} disabled={disabled}
    className="admin-btn"
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: small ? '6px 12px' : '10px 16px',
      borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
      border: outline ? `1px solid ${bg}40` : 'none',
      background: outline ? 'transparent' : disabled ? `${bg}50` : bg,
      color: outline ? bg : color,
      fontSize: small ? 12 : 13, fontWeight: 600,
      width: full ? '100%' : undefined,
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s ease',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap',
    }}
  >{children}</button>
);

const Input: React.FC<{
  label?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; multiline?: boolean; rows?: number;
  accent?: string;
}> = ({ label, value, onChange, placeholder, type = 'text', multiline, rows = 4, accent = C.accent }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>}
    {multiline ? (
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        style={{
          background: '#F8FAFC', border: `1px solid ${accent}25`, borderRadius: 10,
          color: C.text, padding: '10px 12px', fontSize: 13, fontFamily: 'monospace',
          resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
    ) : (
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: '#F8FAFC', border: `1px solid ${accent}25`, borderRadius: 10,
          color: C.text, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
          outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
    )}
  </div>
);

// ══════════════════════════════════════════════════════
// OVERLAY / MODAL WRAPPER
// ══════════════════════════════════════════════════════
const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> =
({ children, onClose, wide }) => {
  // Lock body scroll saat modal terbuka
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      style={{
        // ── FIX UTAMA ──────────────────────────────────────────────────────
        // position:fixed + inset:0 → cover seluruh viewport, tidak terpengaruh
        // paddingBottom dari <main> maupun overflow parent manapun.
        position: 'fixed',
        inset: 0,
        // 100dvh: iOS Safari safe — tidak offset oleh address bar
        height: '100dvh',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(12px)',
        // ── FIX BOTTOM NAV ─────────────────────────────────────────────────
        // Beri ruang untuk BottomNav (56px) + safe area bawah iOS,
        // sehingga sheet tidak tertutup oleh navbar.
        paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: wide ? 560 : 440,
          // maxHeight memperhitungkan padding overlay di atas agar tidak overflow
          maxHeight: 'calc(90dvh - 56px - env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto',
          background: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          padding: 20,
          boxSizing: 'border-box',
          animation: 'admin-slide-up 0.28s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >{children}</div>
    </div>
  );
};

// ══════════════════════════════════════════════════════
// STATS CARD
// ══════════════════════════════════════════════════════
const StatsCard: React.FC<{
  icon: React.ReactNode; value: number; label: string; color: string;
  onClick?: () => void;
}> = ({ icon, value, label, color, onClick }) => (
  <button
    onClick={onClick}
    className="admin-stats-card"
    style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 4, padding: '14px 8px',
      background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 14,
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s', fontFamily: 'inherit',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}
  >
    <div style={{ color }}>{icon}</div>
    <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{value}</span>
    <span style={{ fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: '0.04em' }}>{label}</span>
  </button>
);

// ══════════════════════════════════════════════════════
// USER CARD
// ══════════════════════════════════════════════════════
const UserCard: React.FC<{
  user: WhitelistUser; searchQuery: string;
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
}> = ({ user, onEdit, onDelete, onToggle }) => {
  const statusColor = user.isActive ? C.success : C.error;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.bdr}`,
      borderRadius: 14, padding: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: `${statusColor}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
          <p style={{ fontSize: 13, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
          <p style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>ID: {user.userId}</p>
        </div>
        {/* Toggle switch */}
        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={user.isActive} onChange={onToggle}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
          <div style={{
            width: 42, height: 22, borderRadius: 22, position: 'relative',
            background: user.isActive ? `${C.success}40` : `${C.error}40`,
            border: `1px solid ${user.isActive ? C.success : C.error}`,
            transition: 'all 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
              background: user.isActive ? C.success : C.error,
              left: user.isActive ? 22 : 2, transition: 'left 0.2s',
            }} />
          </div>
        </label>
      </div>
      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Dibuat: {fmtDate(user.createdAt)}</span>
          {user.addedBy && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: C.infoD, borderRadius: 6, padding: '2px 7px',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2.5" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span style={{ fontSize: 10, color: C.info, fontWeight: 600 }}>{user.addedBy?.split('@')[0]}</span>
              {user.addedAt > 0 && <span style={{ fontSize: 10, color: C.muted }}>{fmtShortDate(user.addedAt)}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onEdit} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: C.infoD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onClick={onDelete} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: C.errorD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.error} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════
// ADD / EDIT USER DIALOG
// ══════════════════════════════════════════════════════
const UserDialog: React.FC<{
  mode: 'add' | 'edit'; user?: WhitelistUser; isSuperAdmin: boolean;
  onClose: () => void; onSave: (data: any) => void; loading: boolean;
}> = ({ mode, user, isSuperAdmin, onClose, onSave, loading }) => {
  const [name,     setName]     = useState(user?.name     ?? '');
  const [email,    setEmail]    = useState(user?.email    ?? '');
  const [userId,   setUserId]   = useState(user?.userId   ?? '');
  const [deviceId, setDeviceId] = useState(user?.deviceId ?? '');
  const [addedBy,  setAddedBy]  = useState(user?.addedBy  ?? '');
  const [resetLogin, setResetLogin] = useState(false);
  const [deactivate, setDeactivate] = useState(false);

  const valid = name.trim() && email.trim() && userId.trim() && deviceId.trim();

  const handleSave = () => {
    if (!valid) return;
    const base = { name: name.trim(), email: email.trim().toLowerCase(), userId: userId.trim(), deviceId: deviceId.trim(), addedBy: addedBy.trim() };
    if (mode === 'add') {
      onSave(base);
    } else {
      onSave({ ...user, ...base, lastLogin: resetLogin ? 0 : user!.lastLogin, isActive: deactivate ? false : user!.isActive });
    }
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.accentD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{mode === 'add' ? 'Add New User' : 'Edit User'}</p>
          {mode === 'edit' && <p style={{ fontSize: 12, color: C.muted }}>Update data whitelist</p>}
        </div>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input label="Nama Lengkap" value={name} onChange={setName} placeholder="John Doe" />
        <Input label="Email" value={email} onChange={setEmail} placeholder="john@example.com" type="email" />
        <Input label="User ID" value={userId} onChange={setUserId} placeholder="12345" />
        <Input label="Device ID" value={deviceId} onChange={setDeviceId} placeholder="device_abc123" />
        {isSuperAdmin && (
          <Input label="Added By (Admin Email)" value={addedBy} onChange={setAddedBy} placeholder="admin@example.com" accent={C.warn} />
        )}

        {mode === 'edit' && isSuperAdmin && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: C.infoD, borderRadius: 10, padding: 12 }}>
            <input type="checkbox" checked={resetLogin} onChange={e => setResetLogin(e.target.checked)} style={{ marginTop: 2, accentColor: C.info }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.info }}>Reset Recent Login</p>
              <p style={{ fontSize: 11, color: C.sub }}>Hapus user dari statistik Recent Login (24h)</p>
              {user?.lastLogin ? <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Last login: {fmtDate(user.lastLogin, true)}</p> : null}
            </div>
          </label>
        )}

        {mode === 'edit' && user?.isActive && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: C.warnD, borderRadius: 10, padding: 12 }}>
            <input type="checkbox" checked={deactivate} onChange={e => setDeactivate(e.target.checked)} style={{ marginTop: 2, accentColor: C.warn }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.warn }}>Nonaktifkan User</p>
              <p style={{ fontSize: 11, color: C.sub }}>User tidak bisa login setelah dinonaktifkan</p>
            </div>
          </label>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <ABtn onClick={onClose} outline bg={C.muted} full>Batal</ABtn>
          <ABtn onClick={handleSave} disabled={!valid || loading} bg={C.accent} full>
            {loading ? <Spinner size={14} color="#fff" /> : null}
            {mode === 'add' ? 'Tambah User' : 'Update'}
          </ABtn>
        </div>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════
// DELETE CONFIRM
// ══════════════════════════════════════════════════════
const DeleteDialog: React.FC<{ user: WhitelistUser; onClose: () => void; onConfirm: () => void; loading: boolean }> =
({ user, onClose, onConfirm, loading }) => (
  <Modal onClose={onClose}>
    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.errorD, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.error} strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 6 }}>Hapus User?</p>
      <p style={{ fontSize: 14, color: C.sub }}>{user.name}</p>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Tindakan ini tidak dapat dibatalkan.</p>
    </div>
    <div style={{ display: 'flex', gap: 10 }}>
      <ABtn onClick={onClose} outline bg={C.muted} full>Batal</ABtn>
      <ABtn onClick={onConfirm} disabled={loading} bg={C.error} full>
        {loading ? <Spinner size={14} color="#fff" /> : null}
        Hapus
      </ABtn>
    </div>
  </Modal>
);

// ══════════════════════════════════════════════════════
// IMPORT DIALOG
// ══════════════════════════════════════════════════════
const ImportDialog: React.FC<{ onClose: () => void; onImport: (json: string) => void; loading: boolean }> =
({ onClose, onImport, loading }) => {
  const [json, setJson] = useState('');
  const [err,  setErr]  = useState('');

  const handleImport = () => {
    if (!json.trim()) { setErr('JSON tidak boleh kosong'); return; }
    if (!json.trim().startsWith('[') || !json.trim().endsWith(']')) {
      setErr('JSON harus berupa array (dimulai [ diakhiri ])'); return;
    }
    try { JSON.parse(json); } catch { setErr('Format JSON tidak valid'); return; }
    setErr('');
    onImport(json);
  };

  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.infoD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Import Whitelist Users</p>
          <p style={{ fontSize: 12, color: C.muted }}>Paste JSON atau pilih file</p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div style={{ background: C.infoD, borderRadius: 10, padding: 12, marginBottom: 14, display: 'flex', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <p style={{ fontSize: 12, color: C.info, lineHeight: 1.6 }}>Format: array JSON dengan field id, name, email, userId, deviceId, isActive, createdAt, lastLogin</p>
      </div>

      <Input label="Paste JSON Data" value={json} onChange={v => { setJson(v); setErr(''); }}
        placeholder={'[{"name":"John","email":"john@example.com","userId":"12345","deviceId":"dev1","isActive":true,"createdAt":1234567890,"lastLogin":0}]'}
        multiline rows={8} />

      {json && <p style={{ fontSize: 11, color: C.muted, textAlign: 'right', marginTop: 4 }}>{json.length} karakter</p>}
      {err && <p style={{ fontSize: 12, color: C.error, marginTop: 6 }}>{err}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <ABtn onClick={onClose} outline bg={C.muted} full>Batal</ABtn>
        <ABtn onClick={handleImport} disabled={!json.trim() || loading} bg={C.info} full>
          {loading ? <Spinner size={14} color="#fff" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
          Import
        </ABtn>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════
// EDIT URL DIALOG
// ══════════════════════════════════════════════════════
const UrlDialog: React.FC<{
  field: 'registrationUrl' | 'whatsappHelpUrl';
  currentValue: string; onClose: () => void;
  onSave: (v: string) => void; loading: boolean;
}> = ({ field, currentValue, onClose, onSave, loading }) => {
  const [val, setVal] = useState(currentValue);
  const isReg = field === 'registrationUrl';
  const accent = isReg ? C.info : C.success;
  const label = isReg ? 'Registration URL' : 'WhatsApp URL';

  return (
    <Modal onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isReg
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.83-.83a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          }
        </div>
        <p style={{ fontSize: 17, fontWeight: 700, color: C.text, flex: 1 }}>Edit {label}</p>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <Input label={label} value={val} onChange={setVal} placeholder={isReg ? 'https://stockity.id/registered?a=...' : 'https://wa.me/628...'} accent={accent} />
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <ABtn onClick={onClose} outline bg={C.muted} full>Batal</ABtn>
        <ABtn onClick={() => onSave(val)} disabled={!val.trim() || loading} bg={accent} full>
          {loading ? <Spinner size={14} color="#fff" /> : null}
          Simpan
        </ABtn>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════
// ADMIN MANAGEMENT DIALOG
// ══════════════════════════════════════════════════════
const AdminMgmtDialog: React.FC<{
  admins: AdminUser[]; isSuperAdmin: boolean; currentEmail: string;
  onClose: () => void;
  onAdd: (email: string, name: string, role: string) => void;
  onRemove: (id: string | undefined) => void;
  loadingId: string | null;
}> = ({ admins, isSuperAdmin, currentEmail, onClose, onAdd, onRemove, loadingId }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [role,    setRole]    = useState('admin');
  const [search,  setSearch]  = useState('');

  const filtered = useMemo(() =>
    search.trim()
      ? admins.filter(a => a.email.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase()))
      : admins,
    [admins, search]
  );

  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: C.warnD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.warn} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{isSuperAdmin ? 'Admin Management' : 'Daftar Admin'}</p>
          <p style={{ fontSize: 12, color: C.muted }}>{admins.length} admin terdaftar</p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {isSuperAdmin && (
        <ABtn onClick={() => setShowAdd(!showAdd)} bg={C.warn} full>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
          Tambah Admin
        </ABtn>
      )}

      {showAdd && isSuperAdmin && (
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 14, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input label="Email Admin" value={email} onChange={setEmail} placeholder="admin@email.com" />
          <Input label="Nama" value={name} onChange={setName} placeholder="Nama Admin" />
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width: '100%', background: '#F8FAFC', border: `1px solid ${C.warn}40`, borderRadius: 10, color: C.text, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <ABtn onClick={() => { if (email && name) { onAdd(email.trim().toLowerCase(), name.trim(), role); setShowAdd(false); setEmail(''); setName(''); } }} disabled={!email || !name} bg={C.warn} full small>Simpan Admin</ABtn>
        </div>
      )}

      <div style={{ position: 'relative', marginTop: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari admin..."
          style={{ width: '100%', boxSizing: 'border-box', background: '#F8FAFC', border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, padding: '8px 10px 8px 32px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {filtered.map(admin => (
          <div key={admin.id} style={{ background: '#F8FAFC', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.warnD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.warn} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin.name}</p>
              <p style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin.email}</p>
            </div>
            <Badge label={admin.role === 'super_admin' ? 'Super' : 'Admin'} color={admin.role === 'super_admin' ? C.warn : C.accent} bg={admin.role === 'super_admin' ? C.warnD : C.accentD} />
            {isSuperAdmin && admin.email !== currentEmail && (
              <button onClick={() => onRemove(admin.id)}
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: C.errorD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {loadingId === admin.id ? <Spinner size={12} color={C.error} /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.error} strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>}
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p style={{ textAlign: 'center', color: C.muted, fontSize: 14, padding: '24px 0' }}>Tidak ada admin ditemukan</p>}
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════
// STATS DETAIL DIALOG
// ══════════════════════════════════════════════════════
type StatsFilter = 'total' | 'active' | 'inactive' | 'recent' | 'recentAdded';

const StatsDetailDialog: React.FC<{
  filter: StatsFilter; allUsers: WhitelistUser[]; onClose: () => void;
  onEdit: (u: WhitelistUser) => void; onDelete: (u: WhitelistUser) => void; onToggle: (u: WhitelistUser) => void;
}> = ({ filter, allUsers, onClose, onEdit, onDelete, onToggle }) => {
  const threshold = Date.now() - 24 * 60 * 60 * 1000;
  const filtered = useMemo(() => {
    let users: WhitelistUser[];
    switch (filter) {
      case 'active':      users = allUsers.filter(u => u.isActive);  break;
      case 'inactive':    users = allUsers.filter(u => !u.isActive); break;
      case 'recent':      users = allUsers.filter(u => (u.lastLogin ?? 0) > threshold).sort((a,b) => (b.lastLogin ?? 0) - (a.lastLogin ?? 0)); break;
      case 'recentAdded': users = allUsers.filter(u => (u.createdAt ?? 0) > threshold).sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); break;
      default:            users = [...allUsers].sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
    return users;
  }, [filter, allUsers, threshold]);

  const meta: Record<StatsFilter, { label: string; color: string }> = {
    total:       { label: 'Total Users',         color: C.info    },
    active:      { label: 'Active Users',         color: C.success },
    inactive:    { label: 'Inactive Users',       color: C.error   },
    recent:      { label: 'Recent Login (24h)',   color: C.warn    },
    recentAdded: { label: 'Daftar Baru Web (24h)',color: C.accent  },
  };
  const { label, color } = meta[filter];

  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{label}</p>
          <p style={{ fontSize: 12, color: C.muted }}>{filtered.length} user ditemukan</p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div style={{ maxHeight: '60dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0
          ? <p style={{ textAlign: 'center', color: C.muted, fontSize: 14, padding: '40px 0' }}>Tidak ada user</p>
          : filtered.map(u => (
            <div key={u.id} style={{ background: '#F8FAFC', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${u.isActive ? C.success : C.error}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={u.isActive ? C.success : C.error} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                {u.lastLogin > 0 && <p style={{ fontSize: 10, color: C.muted }}>Login: {fmtDate(u.lastLogin, true)}</p>}
                {u.createdAt > 0 && filter === 'recentAdded' && <p style={{ fontSize: 10, color: C.muted }}>Dibuat: {fmtDate(u.createdAt, true)}</p>}
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <input type="checkbox" checked={u.isActive} onChange={() => onToggle(u)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                <div style={{ width: 36, height: 20, borderRadius: 20, position: 'relative', background: u.isActive ? `${C.success}40` : `${C.error}40`, border: `1px solid ${u.isActive ? C.success : C.error}`, transition: 'all 0.2s' }}>
                  <div style={{ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: u.isActive ? C.success : C.error, left: u.isActive ? 18 : 2, transition: 'left 0.2s' }} />
                </div>
              </label>
              <button onClick={() => onEdit(u)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: C.infoD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button onClick={() => onDelete(u)} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: C.errorD, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.error} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </div>
          ))
        }
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════
// MAIN ADMIN PAGE
// ══════════════════════════════════════════════════════
export default function AdminPage() {
  const router = useRouter();

  // ── Auth state ──────────────────────────────────────
  const [authReady,   setAuthReady]   = useState(false);
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [isSuperAdmin,setIsSuperAdmin]= useState(false);
  const [currentEmail,setCurrentEmail]= useState('');

  // ── Data state ──────────────────────────────────────
  const [users,       setUsers]       = useState<WhitelistUser[]>([]);
  const [allUsers,    setAllUsers]    = useState<WhitelistUser[]>([]);
  const [admins,      setAdmins]      = useState<AdminUser[]>([]);
  const [stats,       setStats]       = useState({ total: 0, active: 0, inactive: 0, recent: 0, recentAdded: 0 });
  const [regConfig,   setRegConfig]   = useState<RegistrationConfig>({ registrationUrl: '', whatsappHelpUrl: '', updatedAt: 0 });
  const [hasMore,     setHasMore]     = useState(true);

  // ── UI state ────────────────────────────────────────
  const [isLoading,    setIsLoading]    = useState(true);
  const [isLoadingMore,setIsLoadingMore]= useState(false);
  const [isActing,     setIsActing]     = useState(false);
  const [search,       setSearch]       = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [showExtraButtons, setShowExtraButtons] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState<string | null>(null);
  const [adminLoadId,  setAdminLoadId]  = useState<string | null>(null);

  // ── Dialogs ─────────────────────────────────────────
  const [addOpen,      setAddOpen]      = useState(false);
  const [editUser,     setEditUser]     = useState<WhitelistUser | null>(null);
  const [deleteUser,   setDeleteUser]   = useState<WhitelistUser | null>(null);
  const [importOpen,   setImportOpen]   = useState(false);
  const [adminMgmtOpen,setAdminMgmtOpen]= useState(false);
  const [statsFilter,  setStatsFilter]  = useState<StatsFilter | null>(null);
  const [regUrlOpen,   setRegUrlOpen]   = useState(false);
  const [waUrlOpen,    setWaUrlOpen]    = useState(false);

  const PAGE_SIZE = 25;

  // ── Debounce search ─────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Auto-dismiss messages ───────────────────────────
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Init: auth check ────────────────────────────────
  useEffect(() => {
    (async () => {
      const valid = await isSessionValid();
      if (!valid) { router.replace('/login'); return; }

      const email = await storage.get('stc_email') ?? '';
      setCurrentEmail(email);

      const [isAdm, isSup] = await Promise.all([checkIsAdmin(email), checkIsSuperAdmin(email)]);
      if (!isAdm) { router.replace('/profile'); return; }

      setIsAdmin(true);
      setIsSuperAdmin(isSup);
      setAuthReady(true);

      await loadData(email, isSup);
    })();
  }, []); // eslint-disable-line

  const loadData = useCallback(async (email: string, superAdmin: boolean) => {
    setIsLoading(true);
    try {
      const [statsData, usersData, allData, adminsData, configData] = await Promise.all([
        getUserStatistics(email, superAdmin),
        getAllWhitelistUsers(email, superAdmin, PAGE_SIZE),
        getAllUsersForStats(email, superAdmin),
        getAdminUsers(),
        getRegistrationConfig(),
      ]);
      setStats(statsData as any);
      setUsers(usersData);
      setAllUsers(allData.map((u) => ({
        ...u,
        id:        (u as any).uid ?? (u as any).id,
        lastLogin: (u as any).lastLogin
          ? new Date((u as any).lastLogin).getTime()
          : undefined,
        createdAt: (u as any).firstLogin
          ? new Date((u as any).firstLogin).getTime()
          : undefined,
      } as WhitelistUser)));
      setAdmins(adminsData);
      setRegConfig(configData);
      setHasMore(usersData.length >= PAGE_SIZE);
    } catch (e: any) {
      setError(`Gagal memuat data: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const more = await getAllWhitelistUsers(currentEmail, isSuperAdmin, users.length + PAGE_SIZE);
      setUsers(more);
      setHasMore(more.length > users.length);
    } finally { setIsLoadingMore(false); }
  };

  // ── Filtered users ──────────────────────────────────
  const displayedUsers = useMemo(() => {
    if (!searchDebounced.trim()) return users;
    const q = searchDebounced.toLowerCase();
    return allUsers.filter(u =>
      (u.name ?? '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.userId ?? '').toLowerCase().includes(q) ||
      (u.deviceId || '').toLowerCase().includes(q)
    );
  }, [users, allUsers, searchDebounced]);

  // ── Actions ─────────────────────────────────────────
  const act = useCallback(async (fn: () => Promise<void>, successMsg: string) => {
    setIsActing(true);
    try {
      await fn();
      setSuccess(successMsg);
      await loadData(currentEmail, isSuperAdmin);
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan');
    } finally { setIsActing(false); }
  }, [currentEmail, isSuperAdmin, loadData]);

  const handleAdd = (data: any) => act(async () => {
    await addWhitelistUser({ ...data, isActive: true, createdAt: Date.now(), lastLogin: 0, addedBy: currentEmail, addedAt: Date.now(), fcmToken: '', fcmTokenUpdatedAt: 0 }, currentEmail);
    setAddOpen(false);
  }, 'User berhasil ditambahkan');

  const handleEdit = (data: WhitelistUser) => act(async () => {
    await updateWhitelistUser(data);
    setEditUser(null);
  }, 'User berhasil diupdate');

  const handleDelete = () => act(async () => {
    if (!deleteUser) return;
    await deleteWhitelistUser(deleteUser.email);
    setDeleteUser(null);
  }, 'User berhasil dihapus');

  const handleToggle = (u: WhitelistUser) => act(async () => {
    await toggleWhitelistUserStatus(u);
  }, `User ${u.isActive ? 'dinonaktifkan' : 'diaktifkan'}`);

  const handleImport = (json: string) => act(async () => {
    const parsed = JSON.parse(json);
    const result = await importWhitelistUsers(parsed, currentEmail);
    setImportOpen(false);
    setSuccess(`Import selesai: ${result.success} berhasil, ${result.skipped} dilewati`);
  }, '');

  const handleAddAdmin = (email: string, name: string, role: string) => act(async () => {
    await addAdminUser(email, name, role, currentEmail);
  }, 'Admin berhasil ditambahkan');

  const handleRemoveAdmin = (id: string | undefined) => {
    if (!id) return;
    setAdminLoadId(id);
    act(async () => {
      await removeAdminUser(id);
    }, 'Admin berhasil dihapus').finally(() => setAdminLoadId(null));
  };

  const handleUpdateUrl = (field: 'registrationUrl' | 'whatsappHelpUrl', val: string) => act(async () => {
    await updateRegistrationConfig(field, val);
    field === 'registrationUrl' ? setRegUrlOpen(false) : setWaUrlOpen(false);
  }, 'URL berhasil diupdate');

  const handleExport = (format: 'json' | 'csv') => {
    if (format === 'json') exportWhitelistAsJson(allUsers);
    else exportWhitelistAsCsv(allUsers);
    setSuccess(`Export ${format.toUpperCase()} berhasil`);
  };

  if (!authReady) {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif", WebkitFontSmoothing: 'antialiased', paddingBottom: 80 }}>

      <style>{`
        @keyframes admin-spin      { to { transform: rotate(360deg); } }
        @keyframes admin-slide-up  { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes admin-fade-in   { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .admin-btn:hover:not(:disabled) { filter: brightness(0.94); transform: translateY(-1px); }
        .admin-stats-card:hover { border-color: ${C.accent}50 !important; transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.07) !important; }
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: ${C.muted}; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: ${C.bdr}; border-radius: 3px; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(244,246,249,0.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.bdr}`, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: '50%', background: C.accentD, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Admin Panel</h1>
              {isSuperAdmin && <Badge label="Super Admin" color={C.warn} bg={C.warnD} />}
            </div>
            <p style={{ fontSize: 12, color: C.muted }}>{stats.total} total users</p>
          </div>
          <button onClick={() => loadData(currentEmail, isSuperAdmin)} disabled={isLoading}
            style={{ width: 36, height: 36, borderRadius: '50%', background: C.accentD, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round"
              style={{ animation: isLoading ? 'admin-spin 0.8s linear infinite' : 'none' }}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>

        {isSuperAdmin && (
          <button onClick={() => setAdminMgmtOpen(true)}
            style={{
              width: '100%', marginTop: 10, padding: '10px 0',
              background: C.warnD, border: `1px solid ${C.warn}40`,
              borderRadius: 10, cursor: 'pointer', color: C.warn,
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Kelola Admin
          </button>
        )}
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── STATS ROW ── */}
        <div style={{ display: 'flex', gap: 8, animation: 'admin-fade-in 0.3s ease both' }}>
          <StatsCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} value={stats.total} label="Total" color={C.info} onClick={() => setStatsFilter('total')} />
          <StatsCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>} value={stats.active} label="Active" color={C.success} onClick={() => setStatsFilter('active')} />
          <StatsCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>} value={stats.inactive} label="Inactive" color={C.error} onClick={() => setStatsFilter('inactive')} />
          {isSuperAdmin && <StatsCard icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>} value={stats.recentAdded} label="Daftar Baru" color={C.accent} onClick={() => setStatsFilter('recentAdded')} />}
        </div>

        {/* ── CONFIG CARDS (Super Admin only) ── */}
        {isSuperAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'admin-fade-in 0.35s ease both' }}>
            <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: C.infoD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.info} strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Registration URL</p>
                  <p style={{ fontSize: 11, color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{regConfig.registrationUrl || '—'}</p>
                </div>
                <ABtn onClick={() => setRegUrlOpen(true)} bg={C.info} small>Edit</ABtn>
              </div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: C.successD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.success} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.83-.83a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>WhatsApp Bantuan</p>
                  <p style={{ fontSize: 11, color: C.success, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{regConfig.whatsappHelpUrl || '—'}</p>
                </div>
                <ABtn onClick={() => setWaUrlOpen(true)} bg={C.success} small>Edit</ABtn>
              </div>
            </div>
          </div>
        )}

        {/* ── WHITELIST CARD ── */}
        <div style={{ background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden', animation: 'admin-fade-in 0.4s ease both', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '14px 14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.accentD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Whitelist</p>
                <p style={{ fontSize: 11, color: C.muted }}>
                  {searchDebounced ? `${displayedUsers.length} dari ${stats.total} users` : `${stats.total} ${isSuperAdmin ? 'total users' : 'user ditambahkan oleh Anda'}`}
                </p>
              </div>
              <button onClick={() => setShowExtraButtons(p => !p)}
                style={{ width: 32, height: 32, borderRadius: 8, background: C.infoD, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.info }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  {showExtraButtons ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
                </svg>
              </button>
              <ABtn onClick={() => setAddOpen(true)} bg={C.accent} small>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                Add User
              </ABtn>
            </div>

            {showExtraButtons && isSuperAdmin && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <ABtn onClick={() => handleExport('json')} bg={C.success} small full>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  JSON
                </ABtn>
                <ABtn onClick={() => handleExport('csv')} bg="#22c55e" small full>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  CSV
                </ABtn>
                <ABtn onClick={() => setImportOpen(true)} bg={C.info} small full>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import
                </ABtn>
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, email, ID..."
                style={{ width: '100%', background: '#F8FAFC', border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, padding: '9px 36px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 110, borderRadius: 14, background: '#F8FAFC', animation: 'admin-fade-in 0.3s ease both', opacity: 0.6 }} />
              ))
            ) : displayedUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                {search ? <><p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Tidak ditemukan</p><p style={{ fontSize: 13 }}>untuk &quot;{search}&quot;</p></> : <><p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Whitelist kosong</p><p style={{ fontSize: 13 }}>Tambah user untuk memulai</p></>}
              </div>
            ) : (
              <>
                {displayedUsers.map(u => (
                  <UserCard key={u.id} user={u} searchQuery={searchDebounced}
                    onEdit={() => setEditUser(u)}
                    onDelete={() => setDeleteUser(u)}
                    onToggle={() => handleToggle(u)}
                  />
                ))}
                {hasMore && !searchDebounced && (
                  <button onClick={loadMore} disabled={isLoadingMore}
                    style={{ width: '100%', padding: '12px 0', borderRadius: 12, background: C.accentD, border: `1px solid ${C.bdr}`, cursor: 'pointer', color: C.accent, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                    {isLoadingMore ? <Spinner size={16} color={C.accent} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>}
                    {isLoadingMore ? 'Loading...' : 'Load More Users'}
                  </button>
                )}
                {!hasMore && displayedUsers.length > 0 && (
                  <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, padding: '8px 0' }}>
                    Semua {displayedUsers.length} user dimuat
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── TOAST MESSAGES ── */}
      {(error || success) && (
        <div style={{
          position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 9998,
          background: error ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${error ? C.error : C.success}30`,
          borderRadius: 12, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'admin-slide-up 0.25s ease',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={error ? C.error : C.success} strokeWidth="2" strokeLinecap="round">
            {error ? <><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></> : <polyline points="20 6 9 17 4 12"/>}
          </svg>
          <p style={{ flex: 1, fontSize: 13, color: error ? C.error : C.success, fontWeight: 500 }}>{error || success}</p>
          <button onClick={() => { setError(null); setSuccess(null); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.muted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* ── DIALOGS ── */}
      {addOpen && <UserDialog mode="add" isSuperAdmin={isSuperAdmin} onClose={() => setAddOpen(false)} onSave={handleAdd} loading={isActing} />}
      {editUser && <UserDialog mode="edit" user={editUser} isSuperAdmin={isSuperAdmin} onClose={() => setEditUser(null)} onSave={handleEdit} loading={isActing} />}
      {deleteUser && <DeleteDialog user={deleteUser} onClose={() => setDeleteUser(null)} onConfirm={handleDelete} loading={isActing} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={handleImport} loading={isActing} />}
      {adminMgmtOpen && <AdminMgmtDialog admins={admins} isSuperAdmin={isSuperAdmin} currentEmail={currentEmail} onClose={() => setAdminMgmtOpen(false)} onAdd={handleAddAdmin} onRemove={handleRemoveAdmin} loadingId={adminLoadId} />}
      {statsFilter && <StatsDetailDialog filter={statsFilter} allUsers={allUsers} onClose={() => setStatsFilter(null)} onEdit={u => { setStatsFilter(null); setEditUser(u); }} onDelete={u => { setStatsFilter(null); setDeleteUser(u); }} onToggle={handleToggle} />}
      {regUrlOpen && <UrlDialog field="registrationUrl" currentValue={regConfig.registrationUrl} onClose={() => setRegUrlOpen(false)} onSave={v => handleUpdateUrl('registrationUrl', v)} loading={isActing} />}
      {waUrlOpen && <UrlDialog field="whatsappHelpUrl" currentValue={regConfig.whatsappHelpUrl} onClose={() => setWaUrlOpen(false)} onSave={v => handleUpdateUrl('whatsappHelpUrl', v)} loading={isActing} />}
    </div>
  );
}