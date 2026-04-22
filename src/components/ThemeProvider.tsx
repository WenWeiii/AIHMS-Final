import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeName = 'emerald' | 'sapphire' | 'harvest' | 'lavender';

interface ThemeColors {
  primary: string;
  primaryContainer: string;
  secondary: string;
  tertiary: string;
  tertiaryContainer: string;
  surface: string;
  surfaceContainerLow: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
}

const themes: Record<ThemeName, ThemeColors> = {
  emerald: {
    primary: '#00440c',
    primaryContainer: '#195c1f',
    secondary: '#755754',
    tertiary: '#4e3500',
    tertiaryContainer: '#ffdeaa',
    surface: '#fef9f1',
    surfaceContainerLow: '#f8f3eb',
    surfaceContainerHigh: '#ece7de',
    surfaceContainerHighest: '#e7e2da',
  },
  sapphire: {
    primary: '#003366',
    primaryContainer: '#004d99',
    secondary: '#4a5568',
    tertiary: '#2c5282',
    tertiaryContainer: '#bee3f8',
    surface: '#f0f4f8',
    surfaceContainerLow: '#e1e8f0',
    surfaceContainerHigh: '#cbd5e0',
    surfaceContainerHighest: '#a0aec0',
  },
  harvest: {
    primary: '#8a4b08',
    primaryContainer: '#b45309',
    secondary: '#78350f',
    tertiary: '#92400e',
    tertiaryContainer: '#fef3c7',
    surface: '#fffaf0',
    surfaceContainerLow: '#fff4e0',
    surfaceContainerHigh: '#fde68a',
    surfaceContainerHighest: '#fbbf24',
  },
  lavender: {
    primary: '#4a148c',
    primaryContainer: '#6a1b9a',
    secondary: '#4527a0',
    tertiary: '#311b92',
    tertiaryContainer: '#e1bee7',
    surface: '#f3e5f5',
    surfaceContainerLow: '#e1bee7',
    surfaceContainerHigh: '#ce93d8',
    surfaceContainerHighest: '#ba68c8',
  }
};

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('app-theme');
    return (saved as ThemeName) || 'emerald';
  });

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem('app-theme', newTheme);
  };

  useEffect(() => {
    const colors = themes[theme];
    const root = document.documentElement;
    
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-container', colors.primaryContainer);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-tertiary', colors.tertiary);
    root.style.setProperty('--color-tertiary-container', colors.tertiaryContainer);
    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-surface-container-low', colors.surfaceContainerLow);
    root.style.setProperty('--color-surface-container-high', colors.surfaceContainerHigh);
    root.style.setProperty('--color-surface-container-highest', colors.surfaceContainerHighest);
    
    // Update signature gradient and shadow
    root.style.setProperty('--signature-gradient', `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`);
    root.style.setProperty('--shadow-ambient-color', colors.primary + '14'); // 8% opacity hex
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
