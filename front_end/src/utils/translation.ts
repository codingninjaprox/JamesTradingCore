import { Translation } from '@/types/language';

export function getTranslation(translations: Translation, key: string): string {
  // First try to get the direct key
  if (translations[key] !== undefined && typeof translations[key] === 'string') {
    return translations[key] as string;
  }

  // If not found as direct key, try nested keys
  const keys = key?.split('.');
  let current: any = translations;

  for (const k of keys || []) {
    if (current[k] === undefined) {
      return key;
    }
    current = current[k];
  }

  return typeof current === 'string' ? current : key;
}

export function formatTranslation(
  translation: string,
  params: Record<string, string | number>
): string {
  return translation.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() || `{${key}}`;
  });
} 