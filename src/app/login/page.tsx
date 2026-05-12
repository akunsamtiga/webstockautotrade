// src/app/login/page.tsx
'use client';
import { useState, useEffect, useRef } from 'react';
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
    padding:        24px 20px 80px;
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
  .foot-lnk { color: var(--accent); font-weight: 500; cursor: pointer; transition: opacity 0.14s; }
  .foot-lnk:hover { opacity: 0.70; }

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
    top: 16px;
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
    top: 16px;
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

  /* Splash */
  .splash {
    position: fixed; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: var(--font);
    -webkit-font-smoothing: antialiased;
    transition: background 1.2s ease;
  }
  .splash-welcome  { background: #ffffff; }
  .splash-verified { background: #f0f7ff; }
  .splash-out {
    background: #f2f2f7;
    animation: sp-fade-out 0.8s ease forwards;
    pointer-events: none;
  }
  @keyframes sp-fade-out { from { opacity: 1; } to { opacity: 0; } }
  .splash-enter { opacity: 1; }

  .sp-icon-wrap {
    width: 76px; height: 76px; border-radius: 22px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 32px;
    transition: background 0.7s ease, border-color 0.7s ease, box-shadow 0.7s ease;
  }
  .sp-icon-welcome {
    background: #f0f7ff;
    border: 1px solid rgba(0,122,255,0.14);
    box-shadow: 0 4px 22px rgba(0,122,255,0.10);
  }
  .sp-icon-verified {
    background: #ffffff;
    border: 1px solid rgba(48,209,88,0.22);
    box-shadow: 0 4px 22px rgba(48,209,88,0.14);
    animation: icon-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }
  @keyframes icon-pop { from { transform: scale(0.8); opacity: 0.5; } to { transform: scale(1); opacity: 1; } }

  .sp-orb {
    position: fixed; border-radius: 50%; pointer-events: none;
    opacity: 0; transition: opacity 0.5s ease;
  }
  .splash-verified .sp-orb, .splash-out .sp-orb { opacity: 1; }
  .sp-orb-1 { width: 380px; height: 380px; background: radial-gradient(circle, rgba(0,122,255,0.40) 0%, transparent 70%); filter: blur(90px); top: -80px; left: -120px; animation: orb-drift-1 5s ease-in-out infinite alternate; }
  .sp-orb-2 { width: 340px; height: 340px; background: radial-gradient(circle, rgba(48,209,88,0.35) 0%, transparent 70%); filter: blur(80px); bottom: -80px; right: -100px; animation: orb-drift-2 6s ease-in-out infinite alternate; }
  .sp-orb-3 { width: 280px; height: 280px; background: radial-gradient(circle, rgba(191,90,242,0.30) 0%, transparent 70%); filter: blur(85px); top: 30%; left: -80px; animation: orb-drift-3 4.5s ease-in-out infinite alternate; }
  .sp-orb-4 { width: 260px; height: 260px; background: radial-gradient(circle, rgba(255,159,10,0.28) 0%, transparent 70%); filter: blur(80px); bottom: 20%; right: -80px; animation: orb-drift-4 5.5s ease-in-out infinite alternate; }
  @keyframes orb-drift-1 { from{transform:translate(0,0)} to{transform:translate(40px,30px)} }
  @keyframes orb-drift-2 { from{transform:translate(0,0)} to{transform:translate(-35px,-25px)} }
  @keyframes orb-drift-3 { from{transform:translate(0,0)} to{transform:translate(30px,20px)} }
  @keyframes orb-drift-4 { from{transform:translate(0,0)} to{transform:translate(-28px,-20px)} }
  .splash-out .sp-orb { animation: orb-fade-out 0.8s ease forwards !important; }
  @keyframes orb-fade-out { from{opacity:1} to{opacity:0} }

  .sp-text-area { position: relative; height: 80px; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .sp-msg { position: absolute; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 0 24px; }
  .sp-title { font-size: clamp(24px, 7vw, 30px); font-weight: 700; letter-spacing: -0.7px; color: #1c1c1e; line-height: 1.15; white-space: nowrap; }
  .sp-sub   { font-size: 14px; color: #6e6e73; font-weight: 400; line-height: 1.5; letter-spacing: -0.1px; }
  .sp-msg-welcome-in  { animation: msg-in 0.55s cubic-bezier(0.22,1,0.36,1) forwards; }
  .sp-msg-welcome-out { animation: msg-out-up 0.4s cubic-bezier(0.4,0,1,1) forwards; }
  .sp-msg-verified-in { animation: msg-in-from-below 0.55s cubic-bezier(0.22,1,0.36,1) forwards; }
  @keyframes msg-in            { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes msg-out-up        { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-20px)} }
  @keyframes msg-in-from-below { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }

  .sp-dots { display: flex; gap: 6px; margin-top: 40px; }
  .sp-dot { height: 6px; border-radius: 99px; background: rgba(0,0,0,0.10); transition: width 0.45s cubic-bezier(0.34,1.2,0.64,1), background 0.3s ease; width: 6px; }
  .sp-dot.act { width: 22px; background: #007aff; }
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
  const [useImg, setUseImg] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passRef  = useRef<HTMLInputElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      setMounted(true);
      const savedEmail = await storage.get('stc_remember_email');
      const savedPass  = await storage.get('stc_remember_password');
      if (savedEmail) { setEmail(savedEmail); setRemember(true); }
      if (savedPass)  { setPassword(savedPass); }
      const sessionValid = await isSessionValid();
      if (sessionValid) router.push('/dashboard');
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
      // ── Step 1: Verify credentials with backend ─────────────────────────
      const res = await api.login(emailVal, passVal);

      // ── Step 2: Check whitelist in Supabase ─────────────────────────────
      //    Only runs after successful auth, so no DB query on wrong passwords.
      setLoginStep('whitelist');
      const allowed = await isWhitelisted(res.email || emailVal);
      if (!allowed) {
        setIsWhitelistError(true);
        throw new Error(t('login.notWhitelisted'));
      }

      // ── Step 3: Persist remember-me choice ─────────────────────────────
      setLoginStep('saving');
      if (remember) {
        await storage.set('stc_remember_email',    emailVal);
        await storage.set('stc_remember_password', passVal);
      } else {
        await storage.remove('stc_remember_email');
        await storage.remove('stc_remember_password');
      }

      // ── Step 4: Record last login (non-blocking — don't await) ──────────
      updateLastLogin(res.email || emailVal).catch(() => {});

      // ── Step 5: Save session and show splash screen ─────────────────────
      await runSplash(res);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.invalidCredentials'));
      setLoading(false);
      setLoginStep('idle');
    }
  };

  // Step hint label shown below button while loading
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
          <div className="sp-orb sp-orb-1" />
          <div className="sp-orb sp-orb-2" />
          <div className="sp-orb sp-orb-3" />
          <div className="sp-orb sp-orb-4" />
          <div className={`sp-icon-wrap ${splash === 'verified' || splash === 'out' ? 'sp-icon-verified' : 'sp-icon-welcome'}`}>
            {splash === 'welcome' ? (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
              </svg>
            ) : (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            )}
          </div>
          <div className="sp-text-area">
            {splash === 'welcome' && (
              <div className="sp-msg sp-msg-welcome-in">
                <span className="sp-title">{t('login.welcome')}</span>
              </div>
            )}
            {(splash === 'verified' || splash === 'out') && (
              <div className="sp-msg sp-msg-verified-in">
                <span className="sp-title">{t('login.loginSuccess')}</span>
                <span className="sp-sub">{t('login.redirecting')}</span>
              </div>
            )}
          </div>
          <div className="sp-dots">
            <div className={`sp-dot ${splash === 'welcome' ? 'act' : ''}`} />
            <div className={`sp-dot ${splash === 'verified' || splash === 'out' ? 'act' : ''}`} />
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
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
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
                    {/* Whitelist error gets a shield/lock icon, others get a dot */}
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

                {/* Step hint — visible only while loading */}
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

            <div className="foot">
              © 2026 STC AutoTrade ·{' '}
              <a className="foot-lnk" href="https://stockity.id/information/privacy" target="_blank" rel="noopener noreferrer">{t('login.terms')}</a>
              {' '}·{' '}
              <a className="foot-lnk" href="https://stockity.id/information/privacy" target="_blank" rel="noopener noreferrer">{t('login.privacy')}</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return <LoginPageContent />;
}