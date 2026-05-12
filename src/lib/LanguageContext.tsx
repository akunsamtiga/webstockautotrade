'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Language, Translations, getTranslation } from './translations';
export type { Language };

// Storage key for language preference
const LANGUAGE_STORAGE_KEY = 'stc_language';
const REGION_STORAGE_KEY   = 'stc_language_region';

// Default language
const DEFAULT_LANGUAGE: Language = 'id';

// ─── AVAILABLE_LANGUAGES (1 entry per language code, used for validation) ─────
export const AVAILABLE_LANGUAGES: {
  code: Language; name: string; flag: string; flagImg: string; nativeName: string;
}[] = [
  { code: 'en', name: 'English',    flag: '🇬🇧', flagImg: 'https://flagcdn.com/w20/gb.png', nativeName: 'English'       },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩', flagImg: 'https://flagcdn.com/w20/id.png', nativeName: 'Indonesia'     },
  { code: 'ru', name: 'Russian',    flag: '🇷🇺', flagImg: 'https://flagcdn.com/w20/ru.png', nativeName: 'Русский'       },
  { code: 'es', name: 'Spanish',    flag: '🇪🇸', flagImg: 'https://flagcdn.com/w20/es.png', nativeName: 'Español'       },
  { code: 'ms', name: 'Malay',      flag: '🇲🇾', flagImg: 'https://flagcdn.com/w20/my.png', nativeName: 'Bahasa Melayu' },
  { code: 'hi', name: 'Hindi',      flag: '🇮🇳', flagImg: 'https://flagcdn.com/w20/in.png', nativeName: 'हिन्दी'         },
  { code: 'th', name: 'Thai',       flag: '🇹🇭', flagImg: 'https://flagcdn.com/w20/th.png', nativeName: 'ภาษาไทย'       },
  { code: 'tr', name: 'Turkish',    flag: '🇹🇷', flagImg: 'https://flagcdn.com/w20/tr.png', nativeName: 'Türkçe'        },
];

// ─── COUNTRY_ENTRIES (banyak negara per bahasa, untuk tampilan di selector) ───
// Setiap entry punya `code` (language) + `region` (kode negara ISO 2-huruf).
// Memilih negara mana pun dalam grup bahasa yang sama → set language code yang sama.
export const COUNTRY_ENTRIES: {
  code:       Language;
  region:     string;
  name:       string;      // nama bahasa dalam English
  flag:       string;      // emoji bendera
  flagImg:    string;      // URL gambar bendera (untuk Windows)
  nativeName: string;      // nama yang ditampilkan di list
}[] = [
  // ── English ──────────────────────────────────────────────────────────────
  { code: 'en', region: 'GB', name: 'English', flag: '🇬🇧', flagImg: 'https://flagcdn.com/w20/gb.png', nativeName: 'English (United Kingdom)'  },
  { code: 'en', region: 'US', name: 'English', flag: '🇺🇸', flagImg: 'https://flagcdn.com/w20/us.png', nativeName: 'English (United States)'   },
  { code: 'en', region: 'AU', name: 'English', flag: '🇦🇺', flagImg: 'https://flagcdn.com/w20/au.png', nativeName: 'English (Australia)'        },
  { code: 'en', region: 'CA', name: 'English', flag: '🇨🇦', flagImg: 'https://flagcdn.com/w20/ca.png', nativeName: 'English (Canada)'           },
  { code: 'en', region: 'NZ', name: 'English', flag: '🇳🇿', flagImg: 'https://flagcdn.com/w20/nz.png', nativeName: 'English (New Zealand)'      },
  { code: 'en', region: 'IE', name: 'English', flag: '🇮🇪', flagImg: 'https://flagcdn.com/w20/ie.png', nativeName: 'English (Ireland)'          },
  { code: 'en', region: 'ZA', name: 'English', flag: '🇿🇦', flagImg: 'https://flagcdn.com/w20/za.png', nativeName: 'English (South Africa)'     },
  { code: 'en', region: 'NG', name: 'English', flag: '🇳🇬', flagImg: 'https://flagcdn.com/w20/ng.png', nativeName: 'English (Nigeria)'          },
  { code: 'en', region: 'PH', name: 'English', flag: '🇵🇭', flagImg: 'https://flagcdn.com/w20/ph.png', nativeName: 'English (Philippines)'      },
  { code: 'en', region: 'SG', name: 'English', flag: '🇸🇬', flagImg: 'https://flagcdn.com/w20/sg.png', nativeName: 'English (Singapore)'        },

  // ── Indonesian ────────────────────────────────────────────────────────────
  { code: 'id', region: 'ID', name: 'Indonesian', flag: '🇮🇩', flagImg: 'https://flagcdn.com/w20/id.png', nativeName: 'Indonesia'              },
  { code: 'id', region: 'TL', name: 'Indonesian', flag: '🇹🇱', flagImg: 'https://flagcdn.com/w20/tl.png', nativeName: 'Indonesia (Timor-Leste)' },

  // ── Russian ───────────────────────────────────────────────────────────────
  { code: 'ru', region: 'RU', name: 'Russian', flag: '🇷🇺', flagImg: 'https://flagcdn.com/w20/ru.png', nativeName: 'Русский (Россия)'         },
  { code: 'ru', region: 'BY', name: 'Russian', flag: '🇧🇾', flagImg: 'https://flagcdn.com/w20/by.png', nativeName: 'Русский (Беларусь)'       },
  { code: 'ru', region: 'KZ', name: 'Russian', flag: '🇰🇿', flagImg: 'https://flagcdn.com/w20/kz.png', nativeName: 'Русский (Казахстан)'      },
  { code: 'ru', region: 'UA', name: 'Russian', flag: '🇺🇦', flagImg: 'https://flagcdn.com/w20/ua.png', nativeName: 'Русский (Украина)'        },
  { code: 'ru', region: 'UZ', name: 'Russian', flag: '🇺🇿', flagImg: 'https://flagcdn.com/w20/uz.png', nativeName: 'Русский (Узбекистан)'     },

  // ── Spanish ───────────────────────────────────────────────────────────────
  { code: 'es', region: 'ES', name: 'Spanish', flag: '🇪🇸', flagImg: 'https://flagcdn.com/w20/es.png', nativeName: 'Español (España)'         },
  { code: 'es', region: 'MX', name: 'Spanish', flag: '🇲🇽', flagImg: 'https://flagcdn.com/w20/mx.png', nativeName: 'Español (México)'         },
  { code: 'es', region: 'AR', name: 'Spanish', flag: '🇦🇷', flagImg: 'https://flagcdn.com/w20/ar.png', nativeName: 'Español (Argentina)'      },
  { code: 'es', region: 'CO', name: 'Spanish', flag: '🇨🇴', flagImg: 'https://flagcdn.com/w20/co.png', nativeName: 'Español (Colombia)'       },
  { code: 'es', region: 'CL', name: 'Spanish', flag: '🇨🇱', flagImg: 'https://flagcdn.com/w20/cl.png', nativeName: 'Español (Chile)'          },
  { code: 'es', region: 'PE', name: 'Spanish', flag: '🇵🇪', flagImg: 'https://flagcdn.com/w20/pe.png', nativeName: 'Español (Perú)'           },
  { code: 'es', region: 'VE', name: 'Spanish', flag: '🇻🇪', flagImg: 'https://flagcdn.com/w20/ve.png', nativeName: 'Español (Venezuela)'      },
  { code: 'es', region: 'EC', name: 'Spanish', flag: '🇪🇨', flagImg: 'https://flagcdn.com/w20/ec.png', nativeName: 'Español (Ecuador)'        },
  { code: 'es', region: 'BO', name: 'Spanish', flag: '🇧🇴', flagImg: 'https://flagcdn.com/w20/bo.png', nativeName: 'Español (Bolivia)'        },

  // ── Malay ─────────────────────────────────────────────────────────────────
  { code: 'ms', region: 'MY', name: 'Malay', flag: '🇲🇾', flagImg: 'https://flagcdn.com/w20/my.png', nativeName: 'Bahasa Melayu (Malaysia)'  },
  { code: 'ms', region: 'BN', name: 'Malay', flag: '🇧🇳', flagImg: 'https://flagcdn.com/w20/bn.png', nativeName: 'Bahasa (Brunei)'           },

  // ── Hindi ─────────────────────────────────────────────────────────────────
  { code: 'hi', region: 'IN', name: 'Hindi', flag: '🇮🇳', flagImg: 'https://flagcdn.com/w20/in.png', nativeName: 'हिन्दी (भारत)'              },
  { code: 'hi', region: 'FJ', name: 'Hindi', flag: '🇫🇯', flagImg: 'https://flagcdn.com/w20/fj.png', nativeName: 'हिन्दी (Fiji)'              },

  // ── Thai ──────────────────────────────────────────────────────────────────
  { code: 'th', region: 'TH', name: 'Thai', flag: '🇹🇭', flagImg: 'https://flagcdn.com/w20/th.png', nativeName: 'ภาษาไทย'                    },

  // ── Turkish ───────────────────────────────────────────────────────────────
  { code: 'tr', region: 'TR', name: 'Turkish', flag: '🇹🇷', flagImg: 'https://flagcdn.com/w20/tr.png', nativeName: 'Türkçe (Türkiye)'         },
  { code: 'tr', region: 'CY', name: 'Turkish', flag: '🇨🇾', flagImg: 'https://flagcdn.com/w20/cy.png', nativeName: 'Türkçe (Kıbrıs)'          },
];

// Detect if running on Windows (emoji flags not supported)
export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Win/i.test(navigator.platform || navigator.userAgent);
}

// Language Context Type
interface LanguageContextType {
  language:           Language;
  selectedRegion:     string;
  setLanguage:        (lang: Language, region?: string) => void;
  t:                  (key: string) => string;
  isLoading:          boolean;
  availableLanguages: typeof AVAILABLE_LANGUAGES;
  countryEntries:     typeof COUNTRY_ENTRIES;
  getLanguageName:    (code: Language) => string;
  getLanguageFlag:    (code: Language) => string;
  getLanguageFlagImg: (code: Language) => string;
  formatNumber:       (num: number) => string;
}

// Create Context
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Language Provider Props
interface LanguageProviderProps {
  children:        ReactNode;
  defaultLanguage?: Language;
}

// Language Provider Component
export function LanguageProvider({ children, defaultLanguage = DEFAULT_LANGUAGE }: LanguageProviderProps) {
  const [language,       setLanguageState]  = useState<Language>(defaultLanguage);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [isLoading,      setIsLoading]      = useState(true);
  const [isClient,       setIsClient]       = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // Load saved language + region preference
  useEffect(() => {
    if (!isClient) return;

    const loadLanguage = async () => {
      try {
        const validCodes = AVAILABLE_LANGUAGES.map(l => l.code);
        const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        const savedRegion   = localStorage.getItem(REGION_STORAGE_KEY) ?? '';

        if (savedLanguage && validCodes.includes(savedLanguage as Language)) {
          setLanguageState(savedLanguage as Language);
          setSelectedRegion(savedRegion);
        } else {
          const browserLang = navigator.language.split('-')[0];
          if (validCodes.includes(browserLang as Language)) {
            setLanguageState(browserLang as Language);
          }
        }
      } catch (error) {
        console.warn('Failed to load language preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, [isClient]);

  // Set language (+ optional region) and save to storage
  const setLanguage = useCallback((lang: Language, region?: string) => {
    // Determine region: pakai region yang diberikan, atau default ke entry pertama
    const resolvedRegion = region ??
      COUNTRY_ENTRIES.find(e => e.code === lang)?.region ?? '';

    setLanguageState(lang);
    setSelectedRegion(resolvedRegion);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
        localStorage.setItem(REGION_STORAGE_KEY,   resolvedRegion);
        document.documentElement.lang = lang;
      } catch (error) {
        console.warn('Failed to save language preference:', error);
      }
    }
  }, []);

  const t = useCallback((key: string): string => getTranslation(language, key), [language]);

  const getLanguageName    = useCallback((code: Language) => {
    const lang = AVAILABLE_LANGUAGES.find(l => l.code === code);
    return lang?.nativeName || lang?.name || code;
  }, []);

  const getLanguageFlag    = useCallback((code: Language) => {
    const lang = AVAILABLE_LANGUAGES.find(l => l.code === code);
    return lang?.flag || '🌐';
  }, []);

  const getLanguageFlagImg = useCallback((code: Language) => {
    const lang = AVAILABLE_LANGUAGES.find(l => l.code === code);
    return lang?.flagImg || '';
  }, []);

  const formatNumberFn = useCallback(
    (num: number) => formatNumber(num, language),
    [language]
  );

  return (
    <LanguageContext.Provider value={{
      language,
      selectedRegion,
      setLanguage,
      t,
      isLoading,
      availableLanguages: AVAILABLE_LANGUAGES,
      countryEntries:     COUNTRY_ENTRIES,
      getLanguageName,
      getLanguageFlag,
      getLanguageFlagImg,
      formatNumber: formatNumberFn,
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Custom hook to use language context
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// HOC to wrap components with language support
export function withLanguage<T extends object>(Component: React.ComponentType<T>) {
  return function WithLanguageComponent(props: T) {
    return (
      <LanguageProvider>
        <Component {...props} />
      </LanguageProvider>
    );
  };
}

// Utility to format numbers based on language
export function formatNumber(num: number, language: Language): string {
  const locales: Record<Language, string> = {
    en: 'en-US', id: 'id-ID', ru: 'ru-RU',
    es: 'es-ES', ms: 'ms-MY', hi: 'hi-IN',
    th: 'th-TH', tr: 'tr-TR',
  };
  return num.toLocaleString(locales[language]);
}

// Utility to format currency based on language
export function formatCurrency(amount: number, currency: string, language: Language): string {
  const locales: Record<Language, string> = {
    en: 'en-US', id: 'id-ID', ru: 'ru-RU',
    es: 'es-ES', ms: 'ms-MY', hi: 'hi-IN',
    th: 'th-TH', tr: 'tr-TR',
  };
  return new Intl.NumberFormat(locales[language], {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount / 100);
}

// Utility to format date based on language
export function formatDate(date: Date | number, language: Language, options?: Intl.DateTimeFormatOptions): string {
  const locales: Record<Language, string> = {
    en: 'en-US', id: 'id-ID', ru: 'ru-RU',
    es: 'es-ES', ms: 'ms-MY', hi: 'hi-IN',
    th: 'th-TH', tr: 'tr-TR',
  };
  return new Intl.DateTimeFormat(locales[language], options ?? {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date);
}

// Utility to format time based on language
export function formatTime(date: Date | number, language: Language, options?: Intl.DateTimeFormatOptions): string {
  const locales: Record<Language, string> = {
    en: 'en-US', id: 'id-ID', ru: 'ru-RU',
    es: 'es-ES', ms: 'ms-MY', hi: 'hi-IN',
    th: 'th-TH', tr: 'tr-TR',
  };
  return new Intl.DateTimeFormat(locales[language], options ?? {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}