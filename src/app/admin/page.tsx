'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { storage, isSessionValid } from '@/lib/storage';
import {
  checkIsAdmin, checkIsSuperAdmin, getUserStatistics, getAllWhitelistUsers,
  addWhitelistUser, updateWhitelistUser, deleteWhitelistUser,
  toggleWhitelistUserStatus, importWhitelistUsers, getAdminUsers, addAdminUser,
  removeAdminUser, updateAdminUser, updateRegistrationConfig, getRegistrationConfig,
  exportWhitelistAsJson, exportWhitelistAsCsv,
  type WhitelistUser, type AdminUser, type RegistrationConfig,
} from '@/lib/supabaseRepository';

// ─── Types ────────────────────────────────────────────────────────────────────
type StatsFilter = 'total' | 'active' | 'inactive' | 'recent' | 'recentAdded';

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmtDate(ts: number | undefined, showTime = false): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const base = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!showTime) return base;
  return `${base} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el); el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

function isUserActive(u: WhitelistUser): boolean {
  // normalizeWhitelistUser sets both is_active and isActive
  if (u.isActive !== undefined) return u.isActive;
  if (u.is_active !== undefined) return u.is_active;
  return false;
}

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────
const Icon = {
  user: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  users: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  check: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  xCircle: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>,
  plus: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>,
  edit: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>,
  shield: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  refresh: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  search: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  download: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  copy: (cls = 'w-3 h-3') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  device: (cls = 'w-3 h-3') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  link: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  phone: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.29 6.29l.83-.83a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  chevDown: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>,
  chevUp: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>,
  back: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>,
  warn: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  clock: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  userPlus: (cls = 'w-4 h-4') => <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
const Spinner = ({ cls = 'w-4 h-4 border-2' }: { cls?: string }) => (
  <div className={`${cls} rounded-full border-current border-t-transparent animate-spin`} />
);

// ─── Toggle Switch ────────────────────────────────────────────────────────────
const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none ${checked ? 'bg-emerald-400' : 'bg-slate-300'}`}
  >
    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${checked ? 'left-5' : 'left-0.5'}`} />
  </button>
);

// ─── Modal / Bottom Sheet ─────────────────────────────────────────────────────
const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ children, onClose, wide }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`w-full ${wide ? 'max-w-xl' : 'max-w-lg'} bg-white rounded-t-3xl overflow-hidden`}
        style={{
          maxHeight: 'calc(92dvh - 56px - env(safe-area-inset-bottom, 0px))',
          animation: 'adminSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="overflow-y-auto px-5 pb-6" style={{ maxHeight: 'calc(92dvh - 56px - env(safe-area-inset-bottom, 0px) - 20px)' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── Input ────────────────────────────────────────────────────────────────────
const Inp: React.FC<{
  label?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; multiline?: boolean; rows?: number; hint?: string;
}> = ({ label, value, onChange, placeholder, type = 'text', multiline, rows = 4, hint }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>}
    {multiline ? (
      <textarea
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="bg-slate-50 border border-slate-200 rounded-xl text-slate-800 px-3 py-2.5 text-sm font-mono resize-y outline-none w-full focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 transition-all"
      />
    ) : (
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-slate-50 border border-slate-200 rounded-xl text-slate-800 px-3 py-2.5 text-sm outline-none w-full focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 transition-all"
      />
    )}
    {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
  </div>
);

// ─── CopyableId ───────────────────────────────────────────────────────────────
const CopyableId = ({
  label, value, icon,
}: { label: string; value: string; icon?: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      onClick={handle}
      className="w-full flex items-center gap-2 bg-slate-50 hover:bg-cyan-50 border border-slate-100 hover:border-cyan-200 rounded-lg px-2.5 py-1.5 text-left transition-all group"
    >
      {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
      <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0 w-12">{label}</span>
      <span className="text-[11px] font-mono text-slate-700 truncate flex-1">{value}</span>
      <span className={`flex-shrink-0 transition-all text-xs ${copied ? 'text-emerald-500 scale-110' : 'text-slate-300 group-hover:text-cyan-400'}`}>
        {copied ? Icon.check('w-3 h-3') : Icon.copy('w-3 h-3')}
      </span>
    </button>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({
  icon, value, label, color, bgColor, onClick, loading,
}: {
  icon: React.ReactNode; value: number; label: string;
  color: string; bgColor: string; onClick?: () => void; loading?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all active:scale-95 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'cursor-default'}`}
  >
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bgColor}`}>
      <span className={color}>{icon}</span>
    </div>
    {loading ? (
      <Spinner cls="w-5 h-5 border-2 text-slate-300" />
    ) : (
      <span className="text-lg font-black text-slate-800 leading-none">{value}</span>
    )}
    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider text-center leading-tight">{label}</span>
  </button>
);

// ─── User Card ────────────────────────────────────────────────────────────────
const UserCard: React.FC<{
  user: WhitelistUser;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}> = ({ user, onEdit, onDelete, onToggle }) => {
  const active = isUserActive(user);
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <div className={`rounded-2xl border p-4 transition-all ${active ? 'bg-white border-slate-200' : 'bg-red-50/40 border-red-200/60'}`}>
      {/* Top: avatar + name + badge */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${active ? 'bg-cyan-100 text-cyan-700' : 'bg-red-100 text-red-600'}`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{user.name ?? '(no name)'}</p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
            {active ? 'AKTIF' : 'BLOKIR'}
          </span>
          <Toggle checked={active} onChange={onToggle} />
        </div>
      </div>

      {/* Copyable IDs */}
      <div className="flex flex-col gap-1 mb-3">
        {user.userId ? (
          <CopyableId
            label="User ID"
            value={user.userId}
            icon={Icon.user('w-3 h-3')}
          />
        ) : (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">{Icon.user('w-3 h-3')}</span>
            <span className="text-[10px] font-semibold text-slate-400 w-12">User ID</span>
            <span className="text-[11px] text-slate-300 italic">—</span>
          </div>
        )}
        {user.deviceId ? (
          <CopyableId
            label="Device"
            value={user.deviceId}
            icon={Icon.device('w-3 h-3')}
          />
        ) : (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">{Icon.device('w-3 h-3')}</span>
            <span className="text-[10px] font-semibold text-slate-400 w-12">Device</span>
            <span className="text-[11px] text-slate-300 italic">—</span>
          </div>
        )}
      </div>

      {/* Footer: meta + actions */}
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-[11px] text-slate-400">
            Dibuat: <span className="text-slate-600">{fmtDate(user.createdAt)}</span>
          </p>
          {user.lastLogin && user.lastLogin > 0 && (
            <p className="text-[11px] text-slate-400">
              Login: <span className="text-slate-600">{fmtDate(user.lastLogin, true)}</span>
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors"
          >
            <span className="text-blue-500">{Icon.edit('w-3.5 h-3.5')}</span>
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
          >
            <span className="text-red-500">{Icon.trash('w-3.5 h-3.5')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Add/Edit Dialog ──────────────────────────────────────────────────────────
const UserDialog: React.FC<{
  mode: 'add' | 'edit'; user?: WhitelistUser; isSuperAdmin: boolean;
  onClose: () => void; onSave: (data: any) => void; loading: boolean;
}> = ({ mode, user, isSuperAdmin, onClose, onSave, loading }) => {
  const [name,       setName]       = useState(user?.name     ?? '');
  const [email,      setEmail]      = useState(user?.email    ?? '');
  const [userId,     setUserId]     = useState(user?.userId   ?? '');
  const [deviceId,   setDeviceId]   = useState(user?.deviceId ?? '');
  const [addedBy,    setAddedBy]    = useState(user?.addedBy  ?? '');
  const [resetLogin, setResetLogin] = useState(false);
  const [deactivate, setDeactivate] = useState(false);
  const valid = name.trim() && email.trim() && userId.trim() && deviceId.trim();

  const handleSave = () => {
    if (!valid) return;
    const base = { name: name.trim(), email: email.trim().toLowerCase(), userId: userId.trim(), deviceId: deviceId.trim(), addedBy: addedBy.trim() };
    if (mode === 'add') { onSave(base); }
    else { onSave({ ...user, ...base, lastLogin: resetLogin ? 0 : user!.lastLogin, isActive: deactivate ? false : isUserActive(user!) }); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
          <span className="text-cyan-600">{Icon.users('w-5 h-5')}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-800">{mode === 'add' ? 'Tambah User' : 'Edit User'}</h3>
          <p className="text-xs text-slate-400">{mode === 'edit' ? user?.email : 'Data whitelist baru'}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-slate-500">{Icon.x('w-4 h-4')}</span>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <Inp label="Nama Lengkap" value={name} onChange={setName} placeholder="John Doe" />
        <Inp label="Email" value={email} onChange={setEmail} placeholder="john@example.com" type="email" />
        <Inp label="User ID (Stockity)" value={userId} onChange={setUserId} placeholder="12345" hint="ID user di platform Stockity" />
        <Inp label="Device ID" value={deviceId} onChange={setDeviceId} placeholder="device_abc123" />
        {isSuperAdmin && (
          <Inp label="Added By (Admin Email)" value={addedBy} onChange={setAddedBy} placeholder="admin@example.com" />
        )}

        {mode === 'edit' && isSuperAdmin && (
          <label className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={resetLogin} onChange={e => setResetLogin(e.target.checked)} className="mt-0.5 accent-blue-500" />
            <div>
              <p className="text-sm font-semibold text-blue-700">Reset Recent Login</p>
              <p className="text-xs text-slate-500">Hapus dari statistik login 24 jam</p>
              {user?.lastLogin ? <p className="text-[11px] text-slate-400 mt-0.5">Terakhir: {fmtDate(user.lastLogin, true)}</p> : null}
            </div>
          </label>
        )}

        {mode === 'edit' && isUserActive(user!) && (
          <label className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={deactivate} onChange={e => setDeactivate(e.target.checked)} className="mt-0.5 accent-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Blokir / Nonaktifkan User</p>
              <p className="text-xs text-slate-500">User tidak bisa login setelah diblokir</p>
            </div>
          </label>
        )}

        <div className="flex gap-2.5 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={!valid || loading}
            className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-cyan-600 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Spinner cls="w-4 h-4 border-2 text-white" />}
            {mode === 'add' ? 'Tambah' : 'Simpan'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Delete Dialog ────────────────────────────────────────────────────────────
const DeleteDialog: React.FC<{ user: WhitelistUser; onClose: () => void; onConfirm: () => void; loading: boolean }> =
({ user, onClose, onConfirm, loading }) => (
  <Modal onClose={onClose}>
    <div className="text-center py-2 mb-4">
      <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3">
        <span className="text-red-500">{Icon.warn('w-7 h-7')}</span>
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-1">Hapus User?</h3>
      <p className="text-sm font-medium text-slate-600">{user.name}</p>
      <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
      <p className="text-xs text-red-500 mt-2">Tindakan ini tidak dapat dibatalkan.</p>
    </div>
    <div className="flex gap-2.5">
      <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
        Batal
      </button>
      <button
        onClick={onConfirm} disabled={loading}
        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
      >
        {loading && <Spinner cls="w-4 h-4 border-2 text-white" />}
        Hapus
      </button>
    </div>
  </Modal>
);

// ─── Import Dialog ────────────────────────────────────────────────────────────
const ImportDialog: React.FC<{ onClose: () => void; onImport: (json: string) => void; loading: boolean }> =
({ onClose, onImport, loading }) => {
  const [json, setJson] = useState('');
  const [err, setErr] = useState('');

  const handleImport = () => {
    if (!json.trim()) { setErr('JSON tidak boleh kosong'); return; }
    if (!json.trim().startsWith('[') || !json.trim().endsWith(']')) { setErr('JSON harus berupa array [ ... ]'); return; }
    try { JSON.parse(json); } catch { setErr('Format JSON tidak valid'); return; }
    setErr('');
    onImport(json);
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-500">{Icon.upload('w-5 h-5')}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-800">Import Whitelist</h3>
          <p className="text-xs text-slate-400">Paste JSON array</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-slate-500">{Icon.x('w-4 h-4')}</span>
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3 text-xs text-blue-700">
        Format: array JSON dengan field <code className="font-mono">name, email, userId, deviceId, isActive, createdAt, lastLogin</code>
      </div>

      <Inp
        label="JSON Data"
        value={json}
        onChange={v => { setJson(v); setErr(''); }}
        placeholder={'[{"name":"...","email":"...","userId":"...","deviceId":"...","isActive":true}]'}
        multiline
        rows={7}
      />
      {json && <p className="text-[11px] text-slate-400 text-right mt-1">{json.length} karakter</p>}
      {err && <p className="text-xs text-red-500 mt-1.5">{err}</p>}

      <div className="flex gap-2.5 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
          Batal
        </button>
        <button
          onClick={handleImport} disabled={!json.trim() || loading}
          className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Spinner cls="w-4 h-4 border-2 text-white" /> : Icon.upload('w-4 h-4')}
          Import
        </button>
      </div>
    </Modal>
  );
};

// ─── URL Edit Dialog ──────────────────────────────────────────────────────────
const UrlDialog: React.FC<{
  field: 'registrationUrl' | 'whatsappHelpUrl';
  currentValue: string; onClose: () => void; onSave: (v: string) => void; loading: boolean;
}> = ({ field, currentValue, onClose, onSave, loading }) => {
  const [val, setVal] = useState(currentValue);
  const isReg = field === 'registrationUrl';

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isReg ? 'bg-blue-100' : 'bg-emerald-100'}`}>
          <span className={isReg ? 'text-blue-500' : 'text-emerald-500'}>
            {isReg ? Icon.link('w-5 h-5') : Icon.phone('w-5 h-5')}
          </span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-800">Edit {isReg ? 'Registration' : 'WhatsApp'} URL</h3>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-slate-500">{Icon.x('w-4 h-4')}</span>
        </button>
      </div>
      <Inp
        label={isReg ? 'Registration URL' : 'WhatsApp URL'}
        value={val}
        onChange={setVal}
        placeholder={isReg ? 'https://stockity.id/registered?a=...' : 'https://wa.me/628...'}
      />
      <div className="flex gap-2.5 mt-4">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
          Batal
        </button>
        <button
          onClick={() => onSave(val)} disabled={!val.trim() || loading}
          className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${isReg ? 'bg-blue-500 hover:bg-blue-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
        >
          {loading && <Spinner cls="w-4 h-4 border-2 text-white" />}
          Simpan
        </button>
      </div>
    </Modal>
  );
};

// ─── Admin Management Dialog ──────────────────────────────────────────────────
const AdminMgmtDialog: React.FC<{
  admins: AdminUser[]; isSuperAdmin: boolean; currentEmail: string;
  onClose: () => void;
  onAdd: (email: string, name: string, role: string) => void;
  onUpdate: (id: string, updates: { name?: string; role?: 'admin' | 'super_admin'; is_active?: boolean }) => void;
  onRemove: (id: string | undefined) => void;
  loadingId: string | null;
}> = ({ admins, isSuperAdmin, currentEmail, onClose, onAdd, onUpdate, onRemove, loadingId }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('admin');
  const [search, setSearch] = useState('');
  // Edit state: key = admin.id, value = draft fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'super_admin'>('admin');
  const [editActive, setEditActive] = useState(true);

  const startEdit = (admin: AdminUser) => {
    setEditingId(admin.id ?? null);
    setEditName(admin.name ?? '');
    setEditRole(admin.role ?? 'admin');
    setEditActive(admin.is_active ?? true);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id: string | undefined) => {
    if (!id) return;
    onUpdate(id, { name: editName.trim(), role: editRole, is_active: editActive });
    setEditingId(null);
  };

  const filtered = useMemo(() =>
    search.trim() ? admins.filter(a =>
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      (a.name ?? '').toLowerCase().includes(search.toLowerCase())
    ) : admins,
    [admins, search]
  );

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <span className="text-amber-600">{Icon.shield('w-5 h-5')}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-800">{isSuperAdmin ? 'Kelola Admin' : 'Daftar Admin'}</h3>
          <p className="text-xs text-slate-400">{admins.length} admin terdaftar</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-slate-500">{Icon.x('w-4 h-4')}</span>
        </button>
      </div>

      {isSuperAdmin && (
        <button
          onClick={() => { setShowAdd(p => !p); setEditingId(null); }}
          className="w-full mb-3 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
        >
          {Icon.plus('w-4 h-4')} Tambah Admin
        </button>
      )}

      {showAdd && isSuperAdmin && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-3 flex flex-col gap-3">
          <Inp label="Email Admin" value={email} onChange={setEmail} placeholder="admin@email.com" />
          <Inp label="Nama" value={name} onChange={setName} placeholder="Nama Admin" />
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl text-slate-800 px-3 py-2.5 text-sm outline-none w-full focus:border-cyan-400 transition-all">
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <button
            onClick={() => { if (email && name) { onAdd(email.trim().toLowerCase(), name.trim(), role); setShowAdd(false); setEmail(''); setName(''); } }}
            disabled={!email || !name}
            className="py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors"
          >
            Simpan Admin
          </button>
        </div>
      )}

      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{Icon.search('w-4 h-4')}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari admin..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl text-slate-800 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-cyan-400 transition-all" />
      </div>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
        {filtered.map(admin => {
          const isEditing = editingId === admin.id;
          const isSelf    = admin.email === currentEmail;

          return (
            <div key={admin.id} className={`rounded-xl border transition-all ${isEditing ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-transparent'}`}>
              {/* ── Normal row ── */}
              {!isEditing && (
                <div className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-600">{Icon.user('w-4 h-4')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{admin.name}</p>
                    <p className="text-xs text-slate-500 truncate">{admin.email}</p>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                    admin.role === 'super_admin' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'
                  }`}>
                    {admin.role === 'super_admin' ? 'SUPER' : 'ADMIN'}
                  </span>
                  {/* Active badge */}
                  {admin.is_active === false && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">OFF</span>
                  )}
                  {isSuperAdmin && !isSelf && (
                    <>
                      {/* Edit button */}
                      <button
                        onClick={() => startEdit(admin)}
                        className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors flex-shrink-0"
                      >
                        <span className="text-blue-500">{Icon.edit('w-3.5 h-3.5')}</span>
                      </button>
                      {/* Delete button — super_admin tidak bisa hapus sesama super_admin */}
                      {admin.role !== 'super_admin' && (
                        <button
                          onClick={() => onRemove(admin.id)}
                          disabled={loadingId === admin.id}
                          className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-60"
                        >
                          {loadingId === admin.id
                            ? <Spinner cls="w-3.5 h-3.5 border-2 text-red-400" />
                            : <span className="text-red-500">{Icon.trash('w-3.5 h-3.5')}</span>}
                        </button>
                      )}
                    </>
                  )}
                  {isSelf && (
                    <span className="text-[9px] font-medium text-slate-400 flex-shrink-0">(kamu)</span>
                  )}
                </div>
              )}

              {/* ── Inline edit form ── */}
              {isEditing && (
                <div className="p-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-amber-700">Edit Admin</span>
                    <span className="text-xs text-slate-400 truncate flex-1">{admin.email}</span>
                  </div>
                  <Inp label="Nama" value={editName} onChange={setEditName} placeholder="Nama Admin" />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</label>
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value as 'admin' | 'super_admin')}
                      className="bg-white border border-slate-200 rounded-xl text-slate-800 px-3 py-2 text-sm outline-none w-full focus:border-amber-400 transition-all"
                    >
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                    <Toggle checked={editActive} onChange={() => setEditActive(p => !p)} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Akun Aktif</p>
                      <p className="text-xs text-slate-400">{editActive ? 'Admin bisa login' : 'Admin tidak bisa login'}</p>
                    </div>
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={cancelEdit}
                      className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => saveEdit(admin.id)}
                      disabled={!editName.trim() || loadingId === admin.id}
                      className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
                    >
                      {loadingId === admin.id && <Spinner cls="w-3.5 h-3.5 border-2 text-white" />}
                      Simpan
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-6">Tidak ada admin ditemukan</p>
        )}
      </div>
    </Modal>
  );
};

// ─── Inline CopyBtn ───────────────────────────────────────────────────────────
const CopyBtn: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      onClick={handle}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-all border ${
        copied
          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
          : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-600'
      }`}
    >
      {copied ? Icon.check('w-2.5 h-2.5') : Icon.copy('w-2.5 h-2.5')}
      {label && <span>{copied ? 'Tersalin!' : label}</span>}
    </button>
  );
};

// ─── Stats Detail Dialog ──────────────────────────────────────────────────────
const StatsDetailDialog: React.FC<{
  filter: StatsFilter; allUsers: WhitelistUser[]; onClose: () => void;
  onEdit: (u: WhitelistUser) => void; onDelete: (u: WhitelistUser) => void; onToggle: (u: WhitelistUser) => void;
}> = ({ filter, allUsers, onClose, onEdit, onDelete, onToggle }) => {
  const threshold = Date.now() - 24 * 60 * 60 * 1000;

  // ✅ FIX: Use isActive helper + correct createdAt for recentAdded
  const filtered = useMemo(() => {
    switch (filter) {
      case 'active':
        return allUsers.filter(u => isUserActive(u));
      case 'inactive':
        // ✅ FIX: Inactive = is_active === false (blocked/blacklisted users)
        return allUsers.filter(u => !isUserActive(u));
      case 'recent':
        return allUsers
          .filter(u => (u.lastLogin ?? 0) > threshold)
          .sort((a, b) => (b.lastLogin ?? 0) - (a.lastLogin ?? 0));
      case 'recentAdded':
        // ✅ FIX: createdAt = added_at ms timestamp from normalizeWhitelistUser
        return allUsers
          .filter(u => (u.createdAt ?? 0) > threshold)
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      default:
        return [...allUsers].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
  }, [filter, allUsers, threshold]);

  const meta: Record<StatsFilter, { label: string; color: string; bg: string }> = {
    total:       { label: 'Semua User',         color: 'text-blue-600',    bg: 'bg-blue-100'    },
    active:      { label: 'User Aktif',          color: 'text-emerald-600', bg: 'bg-emerald-100' },
    inactive:    { label: 'User Diblokir',       color: 'text-red-600',     bg: 'bg-red-100'     },
    recent:      { label: 'Login 24 Jam',        color: 'text-amber-600',   bg: 'bg-amber-100'   },
    recentAdded: { label: 'Daftar Baru (24 Jam)',color: 'text-cyan-600',    bg: 'bg-cyan-100'    },
  };
  const { label, color, bg } = meta[filter];

  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
          <span className={color}>{Icon.users('w-5 h-5')}</span>
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-bold ${color}`}>{label}</h3>
          <p className="text-xs text-slate-400">{filtered.length} user ditemukan</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-slate-500">{Icon.x('w-4 h-4')}</span>
        </button>
      </div>

      {/* ── FIX: Card-based list for readability + copy ID on ALL filters ── */}
      <div className="flex flex-col gap-2.5 max-h-[60dvh] overflow-y-auto pb-1">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">Tidak ada user</p>
        ) : filtered.map(u => {
          const active = isUserActive(u);
          const initials = (u.name ?? u.email).slice(0, 2).toUpperCase();
          return (
            <div
              key={u.id ?? u.email}
              className={`rounded-2xl border p-3.5 transition-all ${active ? 'bg-white border-slate-200' : 'bg-red-50/40 border-red-200/60'}`}
            >
              {/* Row 1: avatar + name + badge + toggle */}
              <div className="flex items-center gap-3 mb-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${active ? 'bg-cyan-100 text-cyan-700' : 'bg-red-100 text-red-600'}`}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate leading-tight">{u.name ?? '(no name)'}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {active ? 'AKTIF' : 'BLOKIR'}
                  </span>
                  <Toggle checked={active} onChange={() => onToggle(u)} />
                </div>
              </div>

              {/* Row 2: Copyable IDs — always shown on ALL filters */}
              <div className="flex flex-col gap-1 mb-2.5">
                {u.userId ? (
                  <CopyableId label="User ID" value={u.userId} icon={Icon.user('w-3 h-3')} />
                ) : (
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-400">{Icon.user('w-3 h-3')}</span>
                    <span className="text-[10px] font-semibold text-slate-400 w-12">User ID</span>
                    <span className="text-[11px] text-slate-300 italic">—</span>
                  </div>
                )}
                {u.deviceId ? (
                  <CopyableId label="Device" value={u.deviceId} icon={Icon.device('w-3 h-3')} />
                ) : (
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-400">{Icon.device('w-3 h-3')}</span>
                    <span className="text-[10px] font-semibold text-slate-400 w-12">Device</span>
                    <span className="text-[11px] text-slate-300 italic">—</span>
                  </div>
                )}
              </div>

              {/* Row 3: timestamp + actions */}
              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  {u.createdAt && u.createdAt > 0 && (
                    <p className="text-[11px] text-slate-400">Dibuat: <span className="text-slate-600">{fmtDate(u.createdAt)}</span></p>
                  )}
                  {u.lastLogin && u.lastLogin > 0 && (
                    <p className="text-[11px] text-slate-400">Login: <span className="text-slate-600">{fmtDate(u.lastLogin, true)}</span></p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onEdit(u)}
                    className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors"
                  >
                    <span className="text-blue-500">{Icon.edit('w-3.5 h-3.5')}</span>
                  </button>
                  <button
                    onClick={() => onDelete(u)}
                    className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
                  >
                    <span className="text-red-500">{Icon.trash('w-3.5 h-3.5')}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminPage() {
  const router = useRouter();

  // Auth
  const [authReady,    setAuthReady]    = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');

  // Data
  const [allUsers,   setAllUsers]   = useState<WhitelistUser[]>([]);
  const [admins,     setAdmins]     = useState<AdminUser[]>([]);
  const [stats,      setStats]      = useState({ total: 0, active: 0, inactive: 0, recent: 0, recentAdded: 0 });
  const [regConfig,  setRegConfig]  = useState<RegistrationConfig>({ registrationUrl: '', whatsappHelpUrl: '', updatedAt: 0 });

  // UI
  const [isLoading,   setIsLoading]   = useState(true);
  const [isActing,    setIsActing]    = useState(false);
  const [search,      setSearch]      = useState('');
  const [searchQ,     setSearchQ]     = useState('');
  const [showExtras,  setShowExtras]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState<string | null>(null);
  const [adminLoadId, setAdminLoadId] = useState<string | null>(null);

  // Dialogs
  const [addOpen,       setAddOpen]       = useState(false);
  const [editUser,      setEditUser]      = useState<WhitelistUser | null>(null);
  const [deleteUser,    setDeleteUser]    = useState<WhitelistUser | null>(null);
  const [importOpen,    setImportOpen]    = useState(false);
  const [adminMgmt,     setAdminMgmt]     = useState(false);
  const [statsFilter,   setStatsFilter]   = useState<StatsFilter | null>(null);
  const [regUrlOpen,    setRegUrlOpen]    = useState(false);
  const [waUrlOpen,     setWaUrlOpen]     = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(search), 280);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-dismiss toasts
  useEffect(() => { if (!error)   return; const t = setTimeout(() => setError(null), 4000);   return () => clearTimeout(t); }, [error]);
  useEffect(() => { if (!success) return; const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }, [success]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const valid = await isSessionValid();
      if (!valid) { router.replace('/login'); return; }
      const email = await storage.get('stc_email') ?? '';
      setCurrentEmail(email);
      const [isAdm, isSup] = await Promise.all([checkIsAdmin(email), checkIsSuperAdmin(email)]);
      if (!isAdm) { router.replace('/profile'); return; }
      setIsSuperAdmin(isSup);
      setAuthReady(true);
      await loadData(email, isSup);
    })();
  }, []); // eslint-disable-line

  // ── Load Data ─────────────────────────────────────────────────────────────
  // ✅ FIX: Use getAllWhitelistUsers for allUsers (has full shape incl isActive, userId, deviceId)
  //         NOT getAllUsersForStats which only returns uid/email/firstLogin/lastLogin
  const loadData = useCallback(async (email: string, superAdmin: boolean) => {
    setIsLoading(true);
    try {
      const [statsData, usersData, adminsData, configData] = await Promise.all([
        getUserStatistics(email, superAdmin),
        getAllWhitelistUsers(email, superAdmin),  // ✅ returns full WhitelistUser with isActive, userId, deviceId
        getAdminUsers(),
        getRegistrationConfig(),
      ]);
      setStats(statsData);
      setAllUsers(usersData);                     // ✅ all users with full shape
      setAdmins(adminsData);
      setRegConfig(configData);
    } catch (e: any) {
      setError(`Gagal memuat data: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Search filter ─────────────────────────────────────────────────────────
  // ✅ FIX: allUsers now has name, userId, deviceId, isActive — search works correctly
  const displayedUsers = useMemo(() => {
    if (!searchQ.trim()) return allUsers;
    const q = searchQ.toLowerCase();
    return allUsers.filter(u =>
      (u.name ?? '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.userId ?? '').toLowerCase().includes(q) ||
      (u.deviceId ?? '').toLowerCase().includes(q)
    );
  }, [allUsers, searchQ]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const act = useCallback(async (fn: () => Promise<void>, msg: string) => {
    setIsActing(true);
    try {
      await fn();
      if (msg) setSuccess(msg);
      await loadData(currentEmail, isSuperAdmin);
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan');
    } finally { setIsActing(false); }
  }, [currentEmail, isSuperAdmin, loadData]);

  const handleAdd    = (data: any)          => act(async () => { await addWhitelistUser({ ...data, isActive: true, createdAt: Date.now(), lastLogin: 0, addedBy: currentEmail, addedAt: Date.now(), fcmToken: '', fcmTokenUpdatedAt: 0 }, currentEmail); setAddOpen(false); }, 'User berhasil ditambahkan ✓');
  const handleEdit   = (data: WhitelistUser)=> act(async () => { await updateWhitelistUser(data); setEditUser(null); }, 'User berhasil diupdate ✓');
  const handleDelete = ()                   => act(async () => { if (!deleteUser) return; await deleteWhitelistUser(deleteUser.email); setDeleteUser(null); }, 'User berhasil dihapus ✓');
  const handleToggle = (u: WhitelistUser)   => act(async () => { await toggleWhitelistUserStatus(u); }, `User ${isUserActive(u) ? 'diblokir' : 'diaktifkan'} ✓`);
  const handleImport = (json: string)       => act(async () => { const parsed = JSON.parse(json); const r = await importWhitelistUsers(parsed, currentEmail); setImportOpen(false); setSuccess(`Import: ${r.success} berhasil, ${r.skipped} dilewati`); }, '');

  const handleAddAdmin    = (email: string, name: string, role: string) => act(async () => { await addAdminUser(email, name, role, currentEmail); }, 'Admin ditambahkan ✓');
  const handleUpdateAdmin = (id: string, updates: { name?: string; role?: 'admin' | 'super_admin'; is_active?: boolean }) => {
    setAdminLoadId(id);
    act(async () => { await updateAdminUser(id, updates); }, 'Admin diupdate ✓').finally(() => setAdminLoadId(null));
  };
  const handleRemoveAdmin = (id: string | undefined) => {
    if (!id) return;
    setAdminLoadId(id);
    act(async () => { await removeAdminUser(id); }, 'Admin dihapus ✓').finally(() => setAdminLoadId(null));
  };
  const handleUpdateUrl = (field: 'registrationUrl' | 'whatsappHelpUrl', val: string) =>
    act(async () => { await updateRegistrationConfig(field, val); field === 'registrationUrl' ? setRegUrlOpen(false) : setWaUrlOpen(false); }, 'URL diupdate ✓');

  const handleExport = (fmt: 'json' | 'csv') => {
    if (fmt === 'json') exportWhitelistAsJson(allUsers);
    else exportWhitelistAsCsv(allUsers);
    setSuccess(`Export ${fmt.toUpperCase()} berhasil ✓`);
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div className="min-h-dvh bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner cls="w-8 h-8 border-3 text-cyan-500" />
          <p className="text-sm text-slate-400">Memuat panel admin…</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-slate-100 pb-24 font-sans antialiased">
      <style>{`
        @keyframes adminSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes adminFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-fade { animation: adminFadeIn 0.3s ease both; }
      `}</style>

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <span className="text-slate-600">{Icon.back('w-4 h-4')}</span>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-800 tracking-tight">Admin Panel</h1>
              {isSuperAdmin && (
                <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full tracking-wider">SUPER</span>
              )}
            </div>
            <p className="text-xs text-slate-400">{stats.total} total users · {currentEmail.split('@')[0]}</p>
          </div>

          <button
            onClick={() => loadData(currentEmail, isSuperAdmin)}
            disabled={isLoading}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <span className={`text-slate-600 ${isLoading ? 'animate-spin' : ''}`}>{Icon.refresh('w-4 h-4')}</span>
          </button>
        </div>

        {/* Super admin action: manage admins */}
        {isSuperAdmin && (
          <button
            onClick={() => setAdminMgmt(true)}
            className="w-full mt-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors"
          >
            {Icon.shield('w-4 h-4')} Kelola Admin
          </button>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── STATS ROW ─────────────────────────────────────────────────── */}
        <div className="flex gap-2 anim-fade">
          <StatCard
            icon={Icon.users('w-4 h-4')} value={stats.total} label="Total"
            color="text-blue-600" bgColor="bg-blue-100"
            onClick={() => setStatsFilter('total')} loading={isLoading}
          />
          <StatCard
            icon={Icon.check('w-4 h-4')} value={stats.active} label="Aktif"
            color="text-emerald-600" bgColor="bg-emerald-100"
            onClick={() => setStatsFilter('active')} loading={isLoading}
          />
          {/* ✅ FIX: Inactive = diblokir/blacklist */}
          <StatCard
            icon={Icon.xCircle('w-4 h-4')} value={stats.inactive} label="Blokir"
            color="text-red-600" bgColor="bg-red-100"
            onClick={() => setStatsFilter('inactive')} loading={isLoading}
          />
          <StatCard
            icon={Icon.clock('w-4 h-4')} value={stats.recent} label="Login 24j"
            color="text-amber-600" bgColor="bg-amber-100"
            onClick={() => setStatsFilter('recent')} loading={isLoading}
          />
          <StatCard
            icon={Icon.userPlus('w-4 h-4')} value={stats.recentAdded} label="Baru 24j"
            color="text-cyan-600" bgColor="bg-cyan-100"
            onClick={() => setStatsFilter('recentAdded')} loading={isLoading}
          />
        </div>

        {/* ── CONFIG CARDS (Super Admin) ────────────────────────────────── */}
        {isSuperAdmin && (
          <div className="space-y-2 anim-fade">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-500">{Icon.link('w-4 h-4')}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">Registration URL</p>
                <p className="text-xs text-blue-500 truncate">{regConfig.registrationUrl || '—'}</p>
              </div>
              <button onClick={() => setRegUrlOpen(true)} className="py-1.5 px-3 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-colors flex-shrink-0">
                Edit
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <span className="text-emerald-500">{Icon.phone('w-4 h-4')}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">WhatsApp Bantuan</p>
                <p className="text-xs text-emerald-600 truncate">{regConfig.whatsappHelpUrl || '—'}</p>
              </div>
              <button onClick={() => setWaUrlOpen(true)} className="py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors flex-shrink-0">
                Edit
              </button>
            </div>
          </div>
        )}

        {/* ── WHITELIST PANEL ───────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden anim-fade">

          {/* Panel header */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
                <span className="text-cyan-600">{Icon.users('w-4 h-4')}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-slate-800">Whitelist Users</p>
                <p className="text-xs text-slate-400">
                  {searchQ ? `${displayedUsers.length} dari ${stats.total}` : `${allUsers.length} users dimuat`}
                </p>
              </div>
              {/* Extras toggle */}
              <button
                onClick={() => setShowExtras(p => !p)}
                className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center transition-colors"
              >
                <span className="text-slate-500">{showExtras ? Icon.chevUp('w-4 h-4') : Icon.chevDown('w-4 h-4')}</span>
              </button>
              {/* Add user */}
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-500 text-white text-xs font-bold hover:bg-cyan-600 transition-colors"
              >
                {Icon.plus('w-3.5 h-3.5')} Add
              </button>
            </div>

            {/* Export/import row */}
            {showExtras && isSuperAdmin && (
              <div className="flex gap-2 mb-3">
                <button onClick={() => handleExport('json')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                  {Icon.download('w-3.5 h-3.5')} JSON
                </button>
                <button onClick={() => handleExport('csv')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors">
                  {Icon.download('w-3.5 h-3.5')} CSV
                </button>
                <button onClick={() => setImportOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-colors">
                  {Icon.upload('w-3.5 h-3.5')} Import
                </button>
              </div>
            )}

            {/* Search bar */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{Icon.search('w-4 h-4')}</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, email, User ID, Device ID…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl text-slate-800 pl-9 pr-9 py-2.5 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {Icon.x('w-4 h-4')}
                </button>
              )}
            </div>
          </div>

          {/* User list */}
          <div className="p-4 space-y-3">
            {isLoading ? (
              <>
                {[0,1,2].map(i => (
                  <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </>
            ) : displayedUsers.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <span className="text-slate-400">{Icon.users('w-7 h-7')}</span>
                </div>
                {searchQ ? (
                  <>
                    <p className="text-sm font-semibold text-slate-600">Tidak ditemukan</p>
                    <p className="text-xs text-slate-400 mt-1">"{searchQ}" tidak cocok dengan data apapun</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-600">Whitelist kosong</p>
                    <p className="text-xs text-slate-400 mt-1">Tambah user untuk memulai</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {displayedUsers.map(u => (
                  <UserCard
                    key={u.id ?? u.email}
                    user={u}
                    onEdit={() => setEditUser(u)}
                    onDelete={() => setDeleteUser(u)}
                    onToggle={() => handleToggle(u)}
                  />
                ))}
                <p className="text-center text-xs text-slate-400 pt-1 pb-2">
                  {searchQ
                    ? `${displayedUsers.length} hasil pencarian`
                    : `${displayedUsers.length} users · Tap stat card untuk filter`
                  }
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── TOAST ────────────────────────────────────────────────────────── */}
      {(error || success) && (
        <div
          className={`fixed bottom-24 left-4 right-4 z-50 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg border ${
            error
              ? 'bg-red-50 border-red-100 text-red-700'
              : 'bg-emerald-50 border-emerald-100 text-emerald-700'
          }`}
          style={{ animation: 'adminSlideUp 0.25s ease' }}
        >
          <span>{error ? Icon.warn('w-4 h-4') : Icon.check('w-4 h-4')}</span>
          <p className="flex-1 text-sm font-medium">{error ?? success}</p>
          <button onClick={() => { setError(null); setSuccess(null); }}>
            <span className="text-current opacity-60">{Icon.x('w-4 h-4')}</span>
          </button>
        </div>
      )}

      {/* ── DIALOGS ──────────────────────────────────────────────────────── */}
      {addOpen    && <UserDialog mode="add" isSuperAdmin={isSuperAdmin} onClose={() => setAddOpen(false)} onSave={handleAdd} loading={isActing} />}
      {editUser   && <UserDialog mode="edit" user={editUser} isSuperAdmin={isSuperAdmin} onClose={() => setEditUser(null)} onSave={handleEdit} loading={isActing} />}
      {deleteUser && <DeleteDialog user={deleteUser} onClose={() => setDeleteUser(null)} onConfirm={handleDelete} loading={isActing} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={handleImport} loading={isActing} />}
      {adminMgmt  && <AdminMgmtDialog admins={admins} isSuperAdmin={isSuperAdmin} currentEmail={currentEmail} onClose={() => setAdminMgmt(false)} onAdd={handleAddAdmin} onUpdate={handleUpdateAdmin} onRemove={handleRemoveAdmin} loadingId={adminLoadId} />}
      {statsFilter && (
        <StatsDetailDialog
          filter={statsFilter} allUsers={allUsers} onClose={() => setStatsFilter(null)}
          onEdit={u => { setStatsFilter(null); setEditUser(u); }}
          onDelete={u => { setStatsFilter(null); setDeleteUser(u); }}
          onToggle={handleToggle}
        />
      )}
      {regUrlOpen && <UrlDialog field="registrationUrl" currentValue={regConfig.registrationUrl ?? ''} onClose={() => setRegUrlOpen(false)} onSave={v => handleUpdateUrl('registrationUrl', v)} loading={isActing} />}
      {waUrlOpen  && <UrlDialog field="whatsappHelpUrl" currentValue={regConfig.whatsappHelpUrl ?? ''} onClose={() => setWaUrlOpen(false)} onSave={v => handleUpdateUrl('whatsappHelpUrl', v)} loading={isActing} />}
    </div>
  );
}