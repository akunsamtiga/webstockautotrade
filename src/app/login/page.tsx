// src/app/login/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { storage, isSessionValid } from '@/lib/storage';
import { isWhitelisted, updateLastLogin } from '@/lib/supabaseRepository';
import { LanguageProvider, useLanguage, AVAILABLE_LANGUAGES, Language, isWindows } from '@/lib';

type SplashPhase = 'hidden' | 'welcome' | 'verified' | 'out';

// ── CSS string extracted so it can be used with dangerouslySetInnerHTML ──────
const LOGIN_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #f2f2f7;
    --surface:      rgba(255,255,255,0.80);
    --border:       rgba(0,0,0,0.08);
    --border-focus: rgba(0,122,255,0.50);
    --text-1:       #1c1c1e;
    --text-2:       #6e6e73;
    --text-3:       #aeaeb2;
    --accent:       #007aff;
    --error:        #ff3b30;
    --error-bg:     rgba(255,59,48,0.07);
    --success:      #34c759;
    --r-md:         13px;
    --r-xl:         24px;
    --font:         -apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  }

  .lr-page {
    font-family:    var(--font);
    position:       fixed;
    inset:          0;
    background:     var(--bg);
    display:        flex;
    flex-direction: column;
    align-items:    center;
    justify-content: center;
    /* ── FIX ANDROID 15 ─────────────────────────────────────────────────
       padding-top memperhitungkan tinggi status bar (safe-area-inset-top).
       max() memastikan minimal 24px agar tetap ada jarak di device lama. */
    padding:        max(24px, calc(env(safe-area-inset-top, 0px) + 12px)) 20px 80px;
    overflow-y:     auto;
    overflow-x:     hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: none;
    -webkit-font-smoothing: antialiased;
  }

  .orb { position: fixed; border-radius: 50%; pointer-events: none; animation: drift 20s ease-in-out infinite alternate; }
  .o1 {
    width: min(55vw,460px); height: min(55vw,460px);
    background: radial-gradient(circle, rgba(0,122,255,0.12) 0%, transparent 68%);
    top: -18%; right: -8%; filter: blur(70px);
  }
  .o2 {
    width: min(42vw,360px); height: min(42vw,360px);
    background: radial-gradient(circle, rgba(48,209,88,0.09) 0%, transparent 68%);
    bottom: -12%; left: -6%; filter: blur(60px); animation-delay: -8s;
  }
  @keyframes drift {
    0%   { transform: translate(0,0) scale(1); }
    50%  { transform: translate(2%,3%) scale(1.03); }
    100% { transform: translate(-2%,1%) scale(0.98); }
  }

  .card {
    position: relative; z-index: 2;
    width: 100%; max-width: 380px;
    opacity: 0; transform: translateY(14px) scale(0.988);
    animation: rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.08s forwards;
  }
  @keyframes rise { to { opacity: 1; transform: translateY(0) scale(1); } }

  .brand { text-align: center; margin-bottom: 10px; }
  .brand-title { display: block; font-size: 26px; font-weight: 700; letter-spacing: -0.7px; color: var(--text-1); margin-bottom: 4px; }
  .brand-sub   { font-size: 14px; color: var(--text-2); font-weight: 400; }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--r-xl);
    padding: 22px 20px 18px;
    backdrop-filter: saturate(180%) blur(30px);
    -webkit-backdrop-filter: saturate(180%) blur(30px);
    box-shadow: 0 8px 36px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.05);
  }

  .fg {
    border: 1px solid var(--border); border-radius: var(--r-md);
    overflow: hidden; margin-bottom: 12px;
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .fg.active { border-color: var(--border-focus); box-shadow: 0 0 0 4px rgba(0,122,255,0.09); }
  .field { position: relative; background: rgba(118,118,128,0.06); }
  .field + .field { border-top: 1px solid var(--border); }
  .fl {
    position: absolute; top: 9px; left: 13px;
    font-size: 10.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.055em; color: var(--text-3);
    pointer-events: none; transition: color 0.18s;
  }
  .fg.active .fl { color: var(--accent); }
  .fi {
    width: 100%; background: transparent; border: none; outline: none;
    padding: 26px 13px 9px;
    font-size: 16px;
    font-weight: 400;
    color: var(--text-1); font-family: var(--font); letter-spacing: -0.2px;
    -webkit-tap-highlight-color: transparent; appearance: none; -webkit-appearance: none;
  }
  .fi::placeholder { color: var(--text-3); font-size: 15px; }
  .fi[type="password"]              { letter-spacing: 3px; }
  .fi[type="password"]::placeholder { letter-spacing: -0.2px; font-size: 15px; }
  .fwrap { position: relative; }
  .eye-btn {
    position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
    background: none; border: none; padding: 5px; cursor: pointer;
    color: var(--text-3); display: flex; align-items: center;
    border-radius: 6px; transition: color 0.15s, background 0.15s;
  }
  .eye-btn:hover { color: var(--text-2); background: rgba(0,0,0,0.04); }

  .remember-row {
    display: flex; align-items: center; gap: 9px;
    margin-bottom: 14px; cursor: pointer;
    -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .cb-box {
    width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0;
    border: 1.5px solid rgba(0,0,0,0.18);
    background: rgba(118,118,128,0.07);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
  }
  .cb-box.checked {
    background: var(--accent); border-color: var(--accent);
    box-shadow: 0 1px 6px rgba(0,122,255,0.30);
  }
  .cb-tick {
    opacity: 0; transform: scale(0.5);
    transition: opacity 0.16s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }
  .cb-box.checked .cb-tick { opacity: 1; transform: scale(1); }
  .cb-label { font-size: 13.5px; color: var(--text-2); font-weight: 400; letter-spacing: -0.1px; }

  .err {
    display: flex; align-items: flex-start; gap: 8px;
    background: var(--error-bg); border: 1px solid rgba(255,59,48,0.16);
    border-radius: 10px; padding: 9px 12px; margin-bottom: 12px;
    animation: shake 0.36s cubic-bezier(0.36,0.07,0.19,0.97);
  }
  @keyframes shake {
    0%,100%{ transform:translateX(0); } 20%{ transform:translateX(-4px); }
    50%    { transform:translateX(4px); } 80%{ transform:translateX(-3px); }
  }
  .err-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--error); flex-shrink: 0; margin-top: 4px; }
  .err-txt  { font-size: 12.5px; color: var(--error); line-height: 1.4; }

  /* Whitelist-specific error: slightly larger + icon emphasis */
  .err-whitelist {
    background: rgba(255,59,48,0.05);
    border-color: rgba(255,59,48,0.22);
  }
  .err-whitelist .err-txt { font-size: 13px; font-weight: 500; }

  .btn {
    width: 100%; height: 46px;
    background: var(--accent); border: none; border-radius: var(--r-md);
    color: #fff; font-size: 15px; font-weight: 600; letter-spacing: -0.2px;
    cursor: pointer; font-family: var(--font);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    position: relative; overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,122,255,0.28);
    transition: opacity 0.15s, transform 0.12s, box-shadow 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .btn::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.11) 0%, transparent 55%);
    pointer-events: none;
  }
  .btn:hover:not(:disabled)  { opacity: 0.88; box-shadow: 0 4px 16px rgba(0,122,255,0.34); }
  .btn:active:not(:disabled) { transform: scale(0.987); opacity: 0.80; }
  .btn:disabled              { opacity: 0.42; cursor: not-allowed; box-shadow: none; }
  .spin {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.28); border-top-color: #fff;
    animation: rot 0.7s linear infinite; flex-shrink: 0;
  }
  @keyframes rot { to { transform: rotate(360deg); } }

  /* Step indicator shown while checking whitelist */
  .step-hint {
    text-align: center;
    font-size: 11.5px;
    color: var(--text-3);
    margin-top: 8px;
    min-height: 16px;
    transition: opacity 0.2s;
  }

  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 13px; padding: 5px 11px; border-radius: 99px;
    background: rgba(0,0,0,0.035); border: 1px solid rgba(0,0,0,0.055);
  }
  .badge-txt { font-size: 10.5px; color: var(--text-3); font-weight: 500; }

  .foot { text-align: center; margin-top: 14px; font-size: 11.5px; color: var(--text-3); }
  .foot-lnk { color: var(--accent); font-weight: 500; cursor: pointer; transition: opacity 0.14s; background: none; border: none; padding: 0; font-family: var(--font); font-size: 13px; }
  .foot-lnk:hover { opacity: 0.70; }

  /* ── Tutorial Modal ─────────────────────────────────────────────────── */
  .tutor-overlay {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,0.40);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    animation: tutor-in 0.22s cubic-bezier(0.22,1,0.36,1);
  }
  @keyframes tutor-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .tutor-modal {
    background: rgba(255,255,255,0.97);
    border-radius: 22px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);
    width: 100%; max-width: 360px;
    overflow: hidden;
    animation: tutor-rise 0.28s cubic-bezier(0.22,1,0.36,1);
  }
  @keyframes tutor-rise {
    from { opacity: 0; transform: translateY(18px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .tutor-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .tutor-title {
    font-size: 15px; font-weight: 650; color: var(--text-1); letter-spacing: -0.3px;
  }
  .tutor-close {
    width: 28px; height: 28px; border-radius: 50%;
    background: rgba(0,0,0,0.06); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-2); transition: background 0.15s;
    flex-shrink: 0;
  }
  .tutor-close:hover { background: rgba(0,0,0,0.11); }
  .tutor-img-wrap {
    position: relative; width: 100%; background: #f7f7f9;
    aspect-ratio: 9/16; max-height: 52vh;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .tutor-img-wrap img {
    width: 100%; height: 100%; object-fit: contain; display: block;
  }
  .tutor-footer {
    padding: 0 18px 18px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .tutor-next-btn {
    background: var(--accent); border: none; cursor: pointer;
    color: #fff; font-family: var(--font);
    font-size: 13px; font-weight: 600; letter-spacing: -0.1px;
    padding: 7px 16px; border-radius: 99px;
    transition: opacity 0.15s, transform 0.12s;
    -webkit-tap-highlight-color: transparent;
  }
  .tutor-next-btn:hover { opacity: 0.86; }
  .tutor-next-btn:active { transform: scale(0.96); }
  .tutor-next-btn:disabled { opacity: 0.28; cursor: default; }
  .tutor-dots {
    display: flex; gap: 6px; align-items: center;
  }
  .tutor-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(0,0,0,0.14);
    transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }
  .tutor-dot.active {
    background: var(--accent); width: 20px; border-radius: 99px;
  }
  .tutor-counter {
    font-size: 12px; color: var(--text-3); font-weight: 500; letter-spacing: -0.1px;
  }
  .tutor-caption {
    padding: 0 18px 12px;
    animation: caption-fade 0.25s ease;
  }
  @keyframes caption-fade {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .tutor-caption-step {
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--accent);
    margin-bottom: 4px;
  }
  .tutor-caption-text {
    font-size: 13px; color: var(--text-2); line-height: 1.5; letter-spacing: -0.1px;
  }
  .tutor-caption-text strong {
    color: var(--text-1); font-weight: 600;
  }

  .register-link {
    text-align: center;
    margin-top: 16px;
    font-size: 14px;
    color: var(--text-2);
  }
  .register-link a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.14s;
  }
  .register-link a:hover { opacity: 0.70; }

  /* Logo */
  .logo-desktop {
    display: none;
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    left: 16px;
    z-index: 10;
    align-items: center;
  }
  .logo-desktop img { height: 32px; width: auto; object-fit: contain; }
  .logo-mobile { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 8px; }
  .logo-mobile img { height: 120px; width: auto; object-fit: contain; }
  .logo-mobile-name { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; color: var(--text-1); line-height: 1; }
  @media (min-width: 600px) {
    .logo-desktop { display: flex; }
    .logo-mobile  { display: none; }
  }

  /* Language Selector */
  .lang-selector {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: 16px;
    z-index: 10;
  }
  .lang-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    background: rgba(255,255,255,0.7);
    border: 1px solid rgba(0,0,0,0.08);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
    backdrop-filter: blur(10px);
    transition: all 0.15s;
    max-width: 160px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .lang-btn:hover {
    background: rgba(255,255,255,0.9);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .lang-btn-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100px;
  }
  .lang-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    overflow: hidden;
    min-width: 180px;
    max-height: 300px;
    overflow-y: auto;
    animation: lang-fade 0.2s ease;
  }
  @keyframes lang-fade {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .lang-option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(60,60,67,0.07);
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    transition: background 0.15s;
    font-family: var(--font);
  }
  .lang-option:last-child { border-bottom: none; }
  .lang-option:hover { background: rgba(0,122,255,0.06); }
  .lang-option.active {
    background: rgba(0,122,255,0.08);
    color: var(--accent);
    font-weight: 600;
  }

  /* ── Splash ─────────────────────────────────────────────────────────── */
  .splash {
    position: fixed; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: var(--font);
    -webkit-font-smoothing: antialiased;
    transition: background 1.2s ease;
    overflow: hidden;
  }
  .splash-welcome  { background: linear-gradient(160deg, #eaf3ff 0%, #f5fff8 60%, #fff8ec 100%); }
  .splash-verified { background: linear-gradient(160deg, #e8faf0 0%, #f0f7ff 100%); }
  .splash-out {
    animation: sp-fade-out 0.8s ease forwards;
    pointer-events: none;
  }
  @keyframes sp-fade-out { from { opacity: 1; } to { opacity: 0; } }
  .splash-enter { opacity: 1; }

  /* Orbs */
  .sp-orb {
    position: fixed; border-radius: 50%; pointer-events: none;
    opacity: 0; transition: opacity 0.6s ease;
  }
  .splash-welcome .sp-orb, .splash-verified .sp-orb, .splash-out .sp-orb { opacity: 1; }
  .sp-orb-1 { width: 420px; height: 420px; background: radial-gradient(circle, rgba(0,122,255,0.22) 0%, transparent 70%); filter: blur(80px); top: -100px; left: -130px; animation: orb-drift-1 6s ease-in-out infinite alternate; }
  .sp-orb-2 { width: 380px; height: 380px; background: radial-gradient(circle, rgba(48,209,88,0.20) 0%, transparent 70%); filter: blur(75px); bottom: -90px; right: -110px; animation: orb-drift-2 7s ease-in-out infinite alternate; }
  .sp-orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, rgba(191,90,242,0.15) 0%, transparent 70%); filter: blur(85px); top: 35%; left: -90px; animation: orb-drift-3 5s ease-in-out infinite alternate; }
  .sp-orb-4 { width: 280px; height: 280px; background: radial-gradient(circle, rgba(255,159,10,0.18) 0%, transparent 70%); filter: blur(80px); bottom: 25%; right: -80px; animation: orb-drift-4 5.5s ease-in-out infinite alternate; }
  @keyframes orb-drift-1 { from{transform:translate(0,0)} to{transform:translate(40px,30px)} }
  @keyframes orb-drift-2 { from{transform:translate(0,0)} to{transform:translate(-35px,-25px)} }
  @keyframes orb-drift-3 { from{transform:translate(0,0)} to{transform:translate(30px,20px)} }
  @keyframes orb-drift-4 { from{transform:translate(0,0)} to{transform:translate(-28px,-20px)} }
  .splash-out .sp-orb { animation: orb-fade-out 0.8s ease forwards !important; }
  @keyframes orb-fade-out { from{opacity:1} to{opacity:0} }

  /* Sparkles */
  .sp-sparkle {
    position: absolute; pointer-events: none; border-radius: 50%;
    animation: sparkle-float linear infinite;
  }
  @keyframes sparkle-float {
    0%   { transform: translateY(0) rotate(0deg);   opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { transform: translateY(-60px) rotate(180deg); opacity: 0; }
  }

  /* Avatar / Icon ring */
  .sp-avatar-wrap {
    position: relative;
    width: 110px; height: 110px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 28px;
  }
  .sp-ring {
    position: absolute; inset: 0; border-radius: 50%;
    border: 2px solid rgba(0,122,255,0.18);
    animation: ring-pulse 2s ease-in-out infinite;
  }
  .sp-ring-2 {
    inset: -12px;
    border-color: rgba(0,122,255,0.10);
    animation-delay: 0.4s;
  }
  .sp-ring-3 {
    inset: -24px;
    border-color: rgba(0,122,255,0.06);
    animation-delay: 0.8s;
  }
  @keyframes ring-pulse {
    0%,100% { transform: scale(1);    opacity: 1; }
    50%      { transform: scale(1.06); opacity: 0.6; }
  }
  .sp-avatar {
    width: 90px; height: 90px; border-radius: 28px;
    display: flex; align-items: center; justify-content: center;
    background: #ffffff;
    border: 1px solid rgba(0,122,255,0.14);
    box-shadow: 0 8px 36px rgba(0,122,255,0.14), 0 2px 8px rgba(0,0,0,0.06);
    animation: avatar-in 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards;
    position: relative; z-index: 1;
  }
  @keyframes avatar-in { from{transform:scale(0.7);opacity:0} to{transform:scale(1);opacity:1} }

  /* verified icon */
  .sp-avatar-verified {
    background: linear-gradient(135deg, #30d158 0%, #25a244 100%);
    border-color: rgba(48,209,88,0.30);
    box-shadow: 0 8px 36px rgba(48,209,88,0.28), 0 2px 8px rgba(0,0,0,0.06);
    animation: avatar-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }
  .sp-ring-verified { border-color: rgba(48,209,88,0.22); }
  .sp-ring-2-verified { border-color: rgba(48,209,88,0.13); }
  .sp-ring-3-verified { border-color: rgba(48,209,88,0.07); }
  @keyframes avatar-pop { 0%{transform:scale(0.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }

  /* Wave emoji */
  .sp-wave { font-size: 38px; line-height: 1; animation: wave-hand 1.2s ease-in-out infinite; display: inline-block; }
  @keyframes wave-hand {
    0%,100% { transform: rotate(0deg);   }
    20%      { transform: rotate(-12deg); }
    40%      { transform: rotate(14deg);  }
    60%      { transform: rotate(-8deg);  }
    80%      { transform: rotate(10deg);  }
  }

  /* Pill badge */
  .sp-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(0,122,255,0.08); border: 1px solid rgba(0,122,255,0.14);
    border-radius: 99px; padding: 5px 14px;
    font-size: 12px; font-weight: 600; color: #007aff;
    letter-spacing: 0.02em;
    animation: pill-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.2s both;
  }
  @keyframes pill-in { from{opacity:0;transform:translateY(8px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  .sp-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: #007aff; animation: blink 1.2s ease-in-out infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* Text */
  .sp-text-area { position: relative; width: 100%; display: flex; align-items: center; justify-content: center; overflow: visible; }
  .sp-msg { position: relative; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 0 28px; }
  .sp-title {
    font-size: clamp(26px, 8vw, 34px); font-weight: 800;
    letter-spacing: -1px; line-height: 1.1;
    background: linear-gradient(135deg, #1c1c1e 0%, #3a3a3c 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .sp-title-success {
    background: linear-gradient(135deg, #25a244 0%, #30d158 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .sp-sub { font-size: 14.5px; color: #6e6e73; font-weight: 400; line-height: 1.5; letter-spacing: -0.1px; }
  .sp-name { font-weight: 700; color: #007aff; -webkit-text-fill-color: #007aff; }

  .sp-msg-welcome-in  { animation: msg-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
  .sp-msg-verified-in { animation: msg-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
  @keyframes msg-in { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }

  /* Progress dots */
  .sp-dots { display: flex; gap: 6px; margin-top: 36px; }
  .sp-dot { height: 6px; border-radius: 99px; background: rgba(0,0,0,0.10); transition: width 0.45s cubic-bezier(0.34,1.2,0.64,1), background 0.3s ease; width: 6px; }
  .sp-dot.act { width: 24px; background: #007aff; }
  .sp-dot.act-green { width: 24px; background: #30d158; }

  /* Toast Notification */
  .toast-container {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 300;
    display: flex;
    justify-content: center;
    /* ── FIX: Toast juga harus di bawah status bar ── */
    padding: calc(16px + env(safe-area-inset-top, 0px)) 20px 0;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: 16px;
    background: rgba(52, 199, 89, 0.95);
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: -0.15px;
    box-shadow: 0 8px 32px rgba(52,199,89,0.25), 0 0 0 0.5px rgba(255,255,255,0.2);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    pointer-events: auto;
    max-width: 90vw;
    animation: toast-in 0.45s cubic-bezier(0.22,1,0.36,1) forwards;
  }
  .toast.hiding {
    animation: toast-out 0.35s cubic-bezier(0.4,0,1,1) forwards;
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-20px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes toast-out {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to   { opacity: 0; transform: translateY(-12px) scale(0.96); }
  }
  .toast-icon {
    width: 24px; height: 24px;
    border-radius: 50%;
    background: rgba(255,255,255,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .toast-close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.8);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    margin-left: 4px;
    transition: color 0.15s;
  }
  .toast-close:hover { color: #fff; }
`;

// ── Loading step labels (shown below the sign-in button while loading) ─────
type LoginStep = 'idle' | 'auth' | 'whitelist' | 'saving';

function LoginPageContent() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>('idle');
  const [error,    setError]    = useState('');
  const [isWhitelistError, setIsWhitelistError] = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const [focused,  setFocused]  = useState<'email' | 'password' | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [splash,   setSplash]   = useState<SplashPhase>('hidden');
  const [showLangSelector, setShowLangSelector] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialPage, setTutorialPage] = useState(0);
  const [useImg, setUseImg] = useState(false);

  // ✅ Toast state for register success
  const [toast, setToast] = useState<{ visible: boolean; message: string; hiding: boolean }>({
    visible: false,
    message: '',
    hiding: false,
  });

  const emailRef = useRef<HTMLInputElement>(null);
  const passRef  = useRef<HTMLInputElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      setMounted(true);

      // ✅ FIX STATUS BAR: Halaman login selalu light — set icon gelap di atas bg terang
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        try {
          const { StatusBar, Style } = await import('@capacitor/status-bar');
          await StatusBar.setStyle({ style: Style.Light });          // icon/teks hitam
          await StatusBar.setBackgroundColor({ color: '#F2F2F7' });  // bg abu terang
        } catch { /* plugin tidak tersedia — abaikan */ }
      }

      const savedEmail = await storage.get('stc_remember_email');
      const savedPass  = await storage.get('stc_remember_password');
      if (savedEmail) { setEmail(savedEmail); setRemember(true); }
      if (savedPass)  { setPassword(savedPass); }
      const sessionValid = await isSessionValid();
      if (sessionValid) router.push('/dashboard');

      // ✅ Check for register success toast
      if (typeof window !== 'undefined') {
        const registerSuccess = sessionStorage.getItem('stc_register_success');
        const registerEmail = sessionStorage.getItem('stc_register_email');
        if (registerSuccess === '1') {
          const msg = registerEmail
            ? `Registrasi berhasil! Akun ${registerEmail} telah ditambahkan ke whitelist.`
            : 'Registrasi berhasil! Silakan login dengan akun Stockity Anda.';
          setToast({ visible: true, message: msg, hiding: false });
          // Clear sessionStorage
          sessionStorage.removeItem('stc_register_success');
          sessionStorage.removeItem('stc_register_email');
          // Auto hide after 5 seconds
          setTimeout(() => {
            setToast(prev => ({ ...prev, hiding: true }));
            setTimeout(() => setToast({ visible: false, message: '', hiding: false }), 400);
          }, 5000);
        }
      }
    };
    init();
  }, [router]);

  useEffect(() => {
    setUseImg(isWindows());
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setShowLangSelector(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const check = () => {
      if (emailRef.current?.value && emailRef.current.value !== email)
        setEmail(emailRef.current.value);
      if (passRef.current?.value && passRef.current.value !== password)
        setPassword(passRef.current.value);
    };
    const t1 = setTimeout(check, 100);
    const t2 = setTimeout(check, 400);
    const t3 = setTimeout(check, 800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [mounted]); // eslint-disable-line

  const runSplash = async (res: { accessToken: string; userId: string; email: string; deviceId: string }) => {
    const { saveUserSession } = await import('@/lib/storage');
    await saveUserSession({
      authtoken: res.accessToken,
      userId: res.userId,
      deviceId: res.deviceId,
      email: res.email,
      userTimezone: 'Asia/Bangkok',
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : '',
      deviceType: 'web',
      currency: 'IDR',
      currencyIso: 'IDR',
    });
    setSplash('welcome');
    setTimeout(() => setSplash('verified'), 3000);
    setTimeout(() => {
      setSplash('out');
      const htmlSplash = document.getElementById('__stc_splash');
      if (htmlSplash) {
        htmlSplash.style.transition = 'none';
        htmlSplash.style.opacity = '1';
        htmlSplash.style.pointerEvents = 'none';
        htmlSplash.classList.remove('hide');
        requestAnimationFrame(() => {
          htmlSplash.style.transition = '';
        });
      }
      sessionStorage.setItem('stc_from_login', '1');
      setTimeout(() => router.push('/dashboard'), 50);
    }, 7000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailVal = emailRef.current?.value || email;
    const passVal  = passRef.current?.value  || password;

    setLoading(true);
    setError('');
    setIsWhitelistError(false);
    setLoginStep('auth');

    try {
      const res = await api.login(emailVal, passVal);

      setLoginStep('whitelist');
      const allowed = await isWhitelisted(res.email || emailVal);
      if (!allowed) {
        setIsWhitelistError(true);
        throw new Error(t('login.notWhitelisted'));
      }

      setLoginStep('saving');
      if (remember) {
        await storage.set('stc_remember_email',    emailVal);
        await storage.set('stc_remember_password', passVal);
      } else {
        await storage.remove('stc_remember_email');
        await storage.remove('stc_remember_password');
      }

      updateLastLogin(res.email || emailVal).catch(() => {});
      await runSplash(res);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.invalidCredentials'));
      setLoading(false);
      setLoginStep('idle');
    }
  };

  const stepHintLabel = (): string => {
    switch (loginStep) {
      case 'auth':      return 'Memverifikasi akun…';
      case 'whitelist': return 'Memeriksa akses whitelist…';
      case 'saving':    return 'Menyimpan sesi…';
      default:          return '';
    }
  };

  const canSubmit = !!(
    (email || emailRef.current?.value) &&
    (password || passRef.current?.value)
  );

  const getLanguageName = (code: Language): string => {
    return AVAILABLE_LANGUAGES.find(l => l.code === code)?.nativeName ?? code.toUpperCase();
  };

  const FlagIcon = ({ lang, size = 16 }: { lang: typeof AVAILABLE_LANGUAGES[0]; size?: number }) => {
    if (useImg) {
      return (
        <Image
          src={lang.flagImg}
          alt={lang.name}
          width={size + 2}
          height={Math.round((size + 2) * 0.75)}
          unoptimized
          style={{
            objectFit: 'cover',
            borderRadius: 2,
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        />
      );
    }
    return <span style={{ fontSize: size }}>{lang.flag}</span>;
  };

  const dismissToast = () => {
    setToast(prev => ({ ...prev, hiding: true }));
    setTimeout(() => setToast({ visible: false, message: '', hiding: false }), 400);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LOGIN_STYLES }} />

      {/* Splash */}
      {splash !== 'hidden' && (
        <div className={[
          'splash',
          splash === 'welcome'  ? 'splash-enter splash-welcome'  : '',
          splash === 'verified' ? 'splash-verified'              : '',
          splash === 'out'      ? 'splash-out'                   : '',
        ].join(' ')}>
          {/* Background orbs */}
          <div className="sp-orb sp-orb-1" />
          <div className="sp-orb sp-orb-2" />
          <div className="sp-orb sp-orb-3" />
          <div className="sp-orb sp-orb-4" />

          {/* Floating sparkles */}
          {splash === 'welcome' && ([
            { size: 8,  color: '#007aff', left: '12%', top: '22%', delay: '0s',    dur: '3.2s' },
            { size: 6,  color: '#30d158', left: '80%', top: '18%', delay: '0.6s',  dur: '2.8s' },
            { size: 10, color: '#ff9f0a', left: '88%', top: '55%', delay: '1.1s',  dur: '3.5s' },
            { size: 5,  color: '#bf5af2', left: '8%',  top: '60%', delay: '0.3s',  dur: '2.6s' },
            { size: 7,  color: '#ff375f', left: '70%', top: '80%', delay: '0.8s',  dur: '3.0s' },
            { size: 9,  color: '#007aff', left: '22%', top: '78%', delay: '1.4s',  dur: '2.9s' },
          ].map((s, i) => (
            <div key={i} className="sp-sparkle" style={{
              width: s.size, height: s.size, background: s.color,
              left: s.left, top: s.top,
              animationDelay: s.delay, animationDuration: s.dur,
              opacity: 0.7,
            }} />
          )))}

          {/* Main icon */}
          <div className="sp-avatar-wrap">
            <div className={`sp-ring ${splash !== 'welcome' ? 'sp-ring-verified' : ''}`} />
            <div className={`sp-ring sp-ring-2 ${splash !== 'welcome' ? 'sp-ring-2-verified' : ''}`} />
            <div className={`sp-ring sp-ring-3 ${splash !== 'welcome' ? 'sp-ring-3-verified' : ''}`} />
            {splash === 'welcome' ? (
              <div className="sp-avatar">
                <span className="sp-wave">👋</span>
              </div>
            ) : (
              <div className="sp-avatar" style={{ background: '#fff', border: '1px solid rgba(48,209,88,0.22)', boxShadow: '0 4px 22px rgba(48,209,88,0.14)', animation: 'avatar-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            )}
          </div>

          {/* Status pill */}
          {splash === 'welcome' && (
            <div className="sp-pill" style={{ marginBottom: 18 }}>
              <div className="sp-pill-dot" />
              Masuk ke akun Anda
            </div>
          )}

          {/* Text */}
          <div className="sp-text-area">
            {splash === 'welcome' && (
              <div className="sp-msg sp-msg-welcome-in">
                <span className="sp-title">{t('login.welcome')}</span>
                <span className="sp-sub">Senang melihat Anda kembali 🎉</span>
              </div>
            )}
            {(splash === 'verified' || splash === 'out') && (
              <div className="sp-msg sp-msg-verified-in">
                <span className="sp-title">{t('login.loginSuccess')}</span>
                <span className="sp-sub">{t('login.redirecting')}</span>
              </div>
            )}
          </div>

          {/* Progress dots */}
          <div className="sp-dots">
            <div className={`sp-dot ${splash === 'welcome' ? 'act' : ''}`} />
            <div className={`sp-dot ${splash === 'verified' || splash === 'out' ? 'act' : ''}`} />
          </div>
        </div>
      )}

      {/* ✅ Toast Notification */}
      {toast.visible && (
        <div className="toast-container">
          <div className={`toast ${toast.hiding ? 'hiding' : ''}`}>
            <div className="toast-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <span style={{ lineHeight: 1.4 }}>{toast.message}</span>
            <button className="toast-close" onClick={dismissToast} aria-label="Tutup notifikasi">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {mounted && (
        <div
          className="lr-page"
          style={splash !== 'hidden' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
        >
          {/* Logo Desktop */}
          <div className="logo-desktop">
            <Image src="/logo.png" alt="STC AutoTrade" width={32} height={32} style={{ height: '32px', width: 'auto' }} />
          </div>

          {/* Language Selector */}
          <div className="lang-selector" ref={langRef}>
            <button
              className="lang-btn"
              onClick={() => setShowLangSelector(!showLangSelector)}
            >
              {(() => { const l = AVAILABLE_LANGUAGES.find(l => l.code === language); return l ? <FlagIcon lang={l} size={16} /> : '🌐'; })()}
              <span className="lang-btn-text">{getLanguageName(language)}</span>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showLangSelector && (
              <div className="lang-dropdown">
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    className={`lang-option ${language === lang.code ? 'active' : ''}`}
                    onClick={() => {
                      setLanguage(lang.code as Language);
                      setShowLangSelector(false);
                    }}
                  >
                    <FlagIcon lang={lang} size={16} />
                    <span>{lang.nativeName}</span>
                    {language === lang.code && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="orb o1" />
          <div className="orb o2" />

          <div className="card">
            <div className="brand">
              {/* Logo Mobile */}
              <div className="logo-mobile">
                <Image src="/logo.png" alt="STC AutoTrade" width={120} height={120} style={{ height: '120px', width: 'auto' }} />
                <span className="logo-mobile-name">STC AutoTrade</span>
              </div>
              <p className="brand-sub">{t('login.subtitle')}</p>
            </div>

            <div className="panel">
              <div tabIndex={0} aria-hidden="true" style={{position:"absolute",opacity:0,width:0,height:0,overflow:"hidden",pointerEvents:"none"}}/>
              <form onSubmit={handleLogin} noValidate>
                <div className={`fg ${focused ? 'active' : ''}`}>
                  <div className="field">
                    <label className="fl" htmlFor="email">{t('login.email')}</label>
                    <div className="fwrap">
                      <input
                        ref={emailRef}
                        id="email" type="email" className="fi"
                        placeholder={t('login.emailPlaceholder')}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        onFocus={() => setFocused('email')}
                        onBlur={() => setFocused(null)}
                        autoComplete="email" autoCapitalize="none"
                        spellCheck={false} required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label className="fl" htmlFor="password">{t('login.password')}</label>
                    <div className="fwrap">
                      <input
                        ref={passRef}
                        id="password"
                        type={showPass ? 'text' : 'password'}
                        className="fi" placeholder={t('login.passwordPlaceholder')}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onFocus={() => setFocused('password')}
                        onBlur={() => setFocused(null)}
                        autoComplete="current-password"
                        required style={{ paddingRight: 40 }}
                      />
                      <button type="button" className="eye-btn"
                        onClick={() => setShowPass(p => !p)}
                        tabIndex={-1}
                        aria-label={showPass ? t('common.close') : t('common.show')}
                      >
                        {showPass ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="remember-row" onClick={() => setRemember(r => !r)}>
                  <div className={`cb-box ${remember ? 'checked' : ''}`}>
                    <svg className="cb-tick" width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="cb-label">{t('login.rememberMe')}</span>
                </label>

                {error && (
                  <div className={`err${isWhitelistError ? ' err-whitelist' : ''}`}>
                    {isWhitelistError ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    ) : (
                      <div className="err-dot" />
                    )}
                    <p className="err-txt">{error}</p>
                  </div>
                )}

                <button type="submit" className="btn" disabled={loading || !canSubmit}>
                  {loading && <div className="spin" />}
                  {loading ? t('login.signingIn') : t('login.signIn')}
                </button>

                <p className="step-hint" style={{ opacity: loading ? 1 : 0 }}>
                  {stepHintLabel()}
                </p>
              </form>

              <div style={{ textAlign: 'center' }}>
                <div className="badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span className="badge-txt">{t('common.encrypted')} & {t('common.secure')}</span>
                </div>
              </div>
            </div>

            <div className="register-link">
              {t('login.noAccount')} <Link href="/register">{t('login.register')}</Link>
            </div>

            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <span style={{ fontSize: 13, color: '#6e6e73' }}>Kesulitan mendaftar? </span>
              <button
                className="foot-lnk"
                onClick={() => { setTutorialPage(0); setShowTutorial(true); }}
              >
                lihat tutorial
              </button>
            </div>

            {/* Tutorial Modal — dirender via portal ke document.body agar blur bekerja */}

          </div>

          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', padding: '16px 0' }}>
            © 2026 STC AutoTrade ·{' '}
            <a href="https://stockity.id/information/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-3)', fontWeight: 500, cursor: 'pointer', transition: 'opacity 0.14s' }}>{t('login.terms')}</a>
          </div>
        </div>
      )}

      {/* Tutorial Modal Portal */}
      {showTutorial && typeof document !== 'undefined' && createPortal((() => {
        const TUTOR_CAPTIONS = [
          {
            step: 'Langkah 1 — Buat Akun',
            text: <span>Gunakan <strong>akun baru</strong> ya! Isi <strong>email</strong>, buat <strong>password</strong>, pilih <strong>mata uang</strong> yang sesuai, lalu tekan tombol <strong>Daftar</strong>.</span>,
          },
          {
            step: 'Langkah 2 — Registrasi Berhasil',
            text: <span>Selamat! Akan muncul pesan sukses seperti gambar di atas. Selanjutnya, tekan tombol <strong>"Login STC AutoTrade"</strong> untuk langsung menuju halaman login 🎉</span>,
          },
          {
            step: 'Langkah 3 — Masuk ke Akun',
            text: <span>Hampir selesai! Masukkan <strong>email</strong> dan <strong>password</strong> yang tadi didaftarkan, lalu tekan login. Selamat bergabung di STC AutoTrade! 🚀</span>,
          },
        ];
        const cap = TUTOR_CAPTIONS[tutorialPage];
        return (
          <div className="tutor-overlay" onClick={() => setShowTutorial(false)}>
            <div className="tutor-modal" onClick={e => e.stopPropagation()}>
              <div className="tutor-header">
                <span className="tutor-title">Tutorial Pendaftaran</span>
                <button className="tutor-close" onClick={() => setShowTutorial(false)} aria-label="Tutup">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="tutor-img-wrap">
                <Image
                  src={`/tutor${tutorialPage + 1}.jpeg`}
                  alt={`Tutorial langkah ${tutorialPage + 1}`}
                  fill
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </div>

              <div key={tutorialPage} className="tutor-caption">
                <p className="tutor-caption-step">{cap.step}</p>
                <p className="tutor-caption-text">{cap.text}</p>
              </div>

              <div className="tutor-footer">
                <div className="tutor-dots">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className={`tutor-dot${tutorialPage === i ? ' active' : ''}`}
                      onClick={() => setTutorialPage(i)}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </div>
                <button
                  className="tutor-next-btn"
                  onClick={() => tutorialPage < 2 ? setTutorialPage(p => p + 1) : setShowTutorial(false)}
                >
                  {tutorialPage < 2 ? 'Selanjutnya' : 'Selesai'}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}
    </>
  );
}

export default function LoginPage() {
  return <LoginPageContent />;
}