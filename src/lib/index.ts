// i18n exports
export { 
  LanguageProvider, 
  useLanguage, 
  withLanguage,
  formatNumber,
  formatCurrency,
  formatDate,
  formatTime,
  isWindows,
  AVAILABLE_LANGUAGES,
  COUNTRY_ENTRIES,
  type Language 
} from './LanguageContext';

export { 
  default as translations, 
  getTranslation,
  type Translations 
} from './translations';