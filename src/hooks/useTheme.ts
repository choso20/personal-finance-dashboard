import { useEffect } from 'react';
import { useSettings } from './useData';

/** Keep the <html> class and localStorage mirror in sync with the theme setting */
export function useTheme() {
  const { theme } = useSettings();
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mql.matches);
      document.documentElement.classList.toggle('dark', dark);
      try {
        if (theme === 'system') localStorage.removeItem('pf-theme');
        else localStorage.setItem('pf-theme', theme);
      } catch {
        /* ignore */
      }
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);
}
