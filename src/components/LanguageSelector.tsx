'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useLanguage, COUNTRY_ENTRIES, AVAILABLE_LANGUAGES, Language, isWindows } from '@/lib/';

interface LanguageSelectorProps {
  variant?:   'row' | 'sheet' | 'dropdown';
  showLabel?: boolean;
  disabled?:  boolean;
}

// ─── FlagIcon ─────────────────────────────────────────────────────────────────
interface FlagIconProps {
  flag:    string;
  flagImg: string;
  name:    string;
  size?:   number;
}
function FlagIcon({ flag, flagImg, name, size = 18 }: FlagIconProps) {
  const [useImg, setUseImg] = useState(false);
  useEffect(() => { setUseImg(isWindows()); }, []);

  if (useImg) {
    return (
      <Image
        src={flagImg}
        alt={name}
        width={size + 2}
        height={Math.round((size + 2) * 0.75)}
        style={{
          objectFit: 'cover',
          borderRadius: 2,
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      />
    );
  }
  return <span style={{ fontSize: size }}>{flag}</span>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Kembalikan entry COUNTRY_ENTRIES yang cocok dengan language + region terpilih. */
function resolveCurrentEntry(language: Language, selectedRegion: string) {
  // Cari entry yang cocok persis (code + region)
  const exact = COUNTRY_ENTRIES.find(e => e.code === language && e.region === selectedRegion);
  if (exact) return exact;
  // Fallback ke entry pertama dengan code yang sama
  return COUNTRY_ENTRIES.find(e => e.code === language) ?? COUNTRY_ENTRIES[0];
}

/**
 * Kelompokkan COUNTRY_ENTRIES menjadi array [{langName, entries[]}].
 * Urutan group = urutan kemunculan pertama di COUNTRY_ENTRIES (mengikuti AVAILABLE_LANGUAGES).
 */
function groupEntries() {
  const groups: { langName: string; entries: typeof COUNTRY_ENTRIES }[] = [];
  const seen   = new Set<Language>();

  for (const entry of COUNTRY_ENTRIES) {
    if (!seen.has(entry.code)) {
      seen.add(entry.code);
      groups.push({ langName: entry.name, entries: [] });
    }
    groups[groups.findIndex(g => g.langName === entry.name)].entries.push(entry);
  }
  return groups;
}

// ─── LanguageSelectorRow ──────────────────────────────────────────────────────
export function LanguageSelectorRow({ showLabel = true, disabled = false }: LanguageSelectorProps) {
  const { language, selectedRegion, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentEntry = resolveCurrentEntry(language, selectedRegion);
  const groups       = groupEntries();

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width:      '100%',
          display:    'flex',
          alignItems: 'center',
          padding:    '10px 16px 10px 14px',
          background: 'transparent',
          border:     'none',
          cursor:     disabled ? 'not-allowed' : 'pointer',
          gap:        12,
          textAlign:  'left',
          opacity:    disabled ? 0.5 : 1,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{
          width:           30,
          height:          30,
          borderRadius:    7,
          background:      'linear-gradient(135deg, #007aff, #5ac8fa)',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
          fontSize:        14,
        }}>
          🌐
        </div>
        <span style={{ flex: 1, fontSize: 15, color: '#1c1c1e' }}>
          {showLabel ? t('language.title') : currentEntry.nativeName}
        </span>
        <span style={{ fontSize: 14, color: '#aeaeb2', marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <FlagIcon flag={currentEntry.flag} flagImg={currentEntry.flagImg} name={currentEntry.name} size={16} />
          {currentEntry.nativeName}
        </span>
        <svg width="6" height="11" viewBox="0 0 7 12" fill="none">
          <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown list */}
      {isOpen && (
        <div style={{
          position:   'absolute',
          top:        '100%',
          left:       16,
          right:      16,
          zIndex:     100,
          background: '#fff',
          borderRadius: 12,
          boxShadow:  '0 4px 24px rgba(0,0,0,0.15)',
          overflow:   'hidden',
          animation:  'fade-up 0.2s ease',
          maxHeight:  320,
          overflowY:  'auto',
        }}>
          <style>{`
            @keyframes fade-up {
              from { opacity: 0; transform: translateY(-8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {groups.map(group => (
            <React.Fragment key={group.langName}>
              {/* Group header */}
              <div style={{
                padding:     '6px 14px 4px',
                fontSize:    11,
                fontWeight:  700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color:       '#aeaeb2',
                background:  '#f9f9fb',
                borderBottom: '1px solid rgba(60,60,67,0.06)',
              }}>
                {group.langName}
              </div>

              {group.entries.map((entry, idx) => {
                const isSelected = entry.code === language && entry.region === (selectedRegion || resolveCurrentEntry(language, selectedRegion).region);
                return (
                  <button
                    key={`${entry.code}-${entry.region}`}
                    onClick={() => { setLanguage(entry.code, entry.region); setIsOpen(false); }}
                    style={{
                      width:      '100%',
                      display:    'flex',
                      alignItems: 'center',
                      padding:    '10px 14px',
                      background: isSelected ? 'rgba(0,122,255,0.06)' : 'transparent',
                      border:     'none',
                      borderBottom: idx < group.entries.length - 1 ? '1px solid rgba(60,60,67,0.06)' : 'none',
                      cursor:     'pointer',
                      textAlign:  'left',
                      gap:        10,
                    }}
                  >
                    <FlagIcon flag={entry.flag} flagImg={entry.flagImg} name={entry.name} size={18} />
                    <span style={{ flex: 1, fontSize: 14, color: isSelected ? '#007aff' : '#1c1c1e', fontWeight: isSelected ? 600 : 400 }}>
                      {entry.nativeName}
                    </span>
                    {isSelected && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LanguageSheet (modal) ────────────────────────────────────────────────────
interface LanguageSheetProps {
  open:    boolean;
  onClose: () => void;
}

export function LanguageSheet({ open, onClose }: LanguageSheetProps) {
  const { language, selectedRegion, setLanguage, t } = useLanguage();
  const groups = groupEntries();

  if (!open) return null;

  return (
    <div style={{
      position:        'fixed',
      inset:           0,
      zIndex:          9999,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         16,
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:         'absolute',
          inset:            0,
          background:       'rgba(0,0,0,0.4)',
          backdropFilter:   'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation:        'bd-in 0.25s ease',
        }}
      />

      {/* Modal card */}
      <div style={{
        position:       'relative',
        zIndex:         1,
        width:          '100%',
        maxWidth:       420,
        maxHeight:      '78dvh',
        display:        'flex',
        flexDirection:  'column',
        background:     '#f2f2f7',
        borderRadius:   20,
        boxShadow:      '0 24px 64px rgba(0,0,0,0.22)',
        animation:      'pop-in 0.28s cubic-bezier(0.32,0.72,0,1)',
        overflow:       'hidden',
      }}>
        <style>{`
          @keyframes bd-in  { from { opacity: 0; } to { opacity: 1; } }
          @keyframes pop-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        `}</style>

        {/* Header */}
        <div style={{
          flexShrink:     0,
          padding:        '16px 20px 12px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          borderBottom:   '0.5px solid rgba(60,60,67,0.14)',
          background:     '#f2f2f7',
        }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1c1c1e', letterSpacing: -0.4 }}>
            {t('language.selectLanguage')}
          </span>
          <button
            onClick={onClose}
            style={{
              width:           28,
              height:          28,
              borderRadius:    '50%',
              background:      'rgba(116,116,128,0.12)',
              border:          'none',
              cursor:          'pointer',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              color:           '#3c3c43',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', flex: 1, background: '#fff' }}>
          {groups.map((group, gIdx) => (
            <div key={group.langName}>
              {/* Language group header */}
              <div style={{
                padding:       '8px 20px 5px',
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color:         '#aeaeb2',
                background:    '#f9f9fb',
                borderTop:     gIdx > 0 ? '6px solid #f2f2f7' : 'none',
                borderBottom:  '1px solid rgba(60,60,67,0.06)',
              }}>
                {group.langName}
              </div>

              {group.entries.map((entry, idx) => {
                const isSelected =
                  entry.code   === language &&
                  entry.region === (selectedRegion || resolveCurrentEntry(language, selectedRegion).region);

                return (
                  <button
                    key={`${entry.code}-${entry.region}`}
                    onClick={() => { setLanguage(entry.code, entry.region); onClose(); }}
                    style={{
                      width:       '100%',
                      background:  isSelected ? 'rgba(0,122,255,0.05)' : 'transparent',
                      border:      'none',
                      cursor:      'pointer',
                      display:     'flex',
                      alignItems:  'center',
                      padding:     '12px 20px',
                      borderBottom: idx < group.entries.length - 1 ? '1px solid rgba(60,60,67,0.07)' : 'none',
                      gap:         14,
                    }}
                  >
                    {/* Flag */}
                    <div style={{
                      width:          38,
                      height:         38,
                      borderRadius:   10,
                      background:     isSelected ? 'rgba(0,122,255,0.08)' : 'rgba(0,0,0,0.04)',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      flexShrink:     0,
                    }}>
                      <FlagIcon flag={entry.flag} flagImg={entry.flagImg} name={entry.name} size={22} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <p style={{
                        fontSize:   15,
                        color:      isSelected ? '#007aff' : '#1c1c1e',
                        fontWeight: isSelected ? 600 : 400,
                        margin:     0,
                        lineHeight: '1.3',
                      }}>
                        {entry.nativeName}
                      </p>
                      <p style={{
                        fontSize: 12,
                        color:    '#aeaeb2',
                        margin:   '2px 0 0 0',
                      }}>
                        {entry.name} · {entry.region}
                      </p>
                    </div>

                    {/* Checkmark */}
                    {isSelected && (
                      <div style={{
                        width:          24,
                        height:         24,
                        borderRadius:   '50%',
                        background:     '#007aff',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexShrink:     0,
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LanguageSelectorCompact (navbar) ─────────────────────────────────────────
export function LanguageSelectorCompact() {
  const { language, selectedRegion, setLanguage } = useLanguage();
  const [isOpen,    setIsOpen]    = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const groups      = groupEntries();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentEntry = resolveCurrentEntry(language, selectedRegion);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Change Language"
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          36,
          height:         36,
          borderRadius:   10,
          background:     'rgba(0,0,0,0.05)',
          border:         'none',
          cursor:         'pointer',
          transition:     'background 0.15s',
        }}
      >
        <FlagIcon flag={currentEntry.flag} flagImg={currentEntry.flagImg} name={currentEntry.name} size={18} />
      </button>

      {isOpen && (
        <div style={{
          position:   'absolute',
          top:        'calc(100% + 8px)',
          right:      0,
          zIndex:     100,
          background: '#fff',
          borderRadius: 12,
          boxShadow:  '0 4px 24px rgba(0,0,0,0.15)',
          overflow:   'hidden',
          minWidth:   180,
          maxHeight:  320,
          overflowY:  'auto',
          animation:  'fade-up 0.2s ease',
        }}>
          <style>{`
            @keyframes fade-up {
              from { opacity: 0; transform: translateY(-8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {groups.map((group, gIdx) => (
            <React.Fragment key={group.langName}>
              <div style={{
                padding:       '6px 12px 4px',
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color:         '#aeaeb2',
                background:    '#f9f9fb',
                borderTop:     gIdx > 0 ? '1px solid rgba(60,60,67,0.08)' : 'none',
              }}>
                {group.langName}
              </div>
              {group.entries.map(entry => {
                const isSelected = entry.code === language && entry.region === (selectedRegion || resolveCurrentEntry(language, selectedRegion).region);
                return (
                  <button
                    key={`${entry.code}-${entry.region}`}
                    onClick={() => { setLanguage(entry.code, entry.region); setIsOpen(false); }}
                    style={{
                      width:      '100%',
                      display:    'flex',
                      alignItems: 'center',
                      padding:    '8px 12px',
                      background: isSelected ? 'rgba(0,122,255,0.06)' : 'transparent',
                      border:     'none',
                      cursor:     'pointer',
                      textAlign:  'left',
                      gap:        8,
                    }}
                  >
                    <FlagIcon flag={entry.flag} flagImg={entry.flagImg} name={entry.name} size={15} />
                    <span style={{ fontSize: 13, color: isSelected ? '#007aff' : '#1c1c1e', fontWeight: isSelected ? 600 : 400, flex: 1 }}>
                      {entry.region}
                    </span>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────
export default function LanguageSelector({ variant = 'row', ...props }: LanguageSelectorProps) {
  switch (variant) {
    case 'sheet':    return null;
    case 'dropdown': return <LanguageSelectorCompact />;
    case 'row':
    default:         return <LanguageSelectorRow {...props} />;
  }
}