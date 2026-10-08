export type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'nl' | 'pt';

export interface Translation {
  [key: string]: string | Translation;
}

export interface LanguageState {
  currentLanguage: Language;
  translations: Translation;
  isLoading: boolean;
  error: string | null;
} 