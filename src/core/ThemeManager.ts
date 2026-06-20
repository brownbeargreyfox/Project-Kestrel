// src/core/ThemeManager.ts - Missing ThemeManager module
import type { ThemeTokens } from '../Types/plugin';

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  colors: {
    primary: '#3b82f6',
    'primary-foreground': '#ffffff',
    secondary: '#6b7280',
    'secondary-foreground': '#ffffff',
    background: '#ffffff',
    foreground: '#1f2937',
    muted: '#f9fafb',
    'muted-foreground': '#6b7280',
    border: '#e5e7eb',
    input: '#ffffff',
    ring: '#3b82f6',
    destructive: '#ef4444',
    'destructive-foreground': '#ffffff',
    warning: '#f59e0b',
    'warning-foreground': '#1f2937',
    success: '#10b981',
    'success-foreground': '#ffffff',
    info: '#3b82f6',
    'info-foreground': '#ffffff'
  },
  spacing: {
    '0': '0px',
    '1': '0.25rem',
    '2': '0.5rem',
    '3': '0.75rem',
    '4': '1rem',
    '5': '1.25rem',
    '6': '1.5rem',
    '8': '2rem',
    '10': '2.5rem',
    '12': '3rem',
    '16': '4rem',
    '20': '5rem',
    '24': '6rem'
  },
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace']
    },
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }]
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700'
    }
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px'
  }
};

export class ThemeManager {
  private currentTheme: ThemeTokens = DEFAULT_THEME_TOKENS;
  private listeners = new Set<(theme: ThemeTokens) => void>();
  
  getTheme(): ThemeTokens {
    return { ...this.currentTheme };
  }
  
  updateTheme(updates: Partial<ThemeTokens>): void {
    this.currentTheme = {
      ...this.currentTheme,
      ...updates,
      colors: { ...this.currentTheme.colors, ...updates.colors },
      spacing: { ...this.currentTheme.spacing, ...updates.spacing },
      typography: { ...this.currentTheme.typography, ...updates.typography },
      breakpoints: { ...this.currentTheme.breakpoints, ...updates.breakpoints }
    };
    
    this.notifyListeners();
  }
  
  subscribe(listener: (theme: ThemeTokens) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getTheme());
      } catch (error) {
        console.error('Theme listener error:', error);
      }
    });
  }
  
  // Apply theme as CSS custom properties
  applyCSSVariables(element: HTMLElement = document.documentElement): void {
    Object.entries(this.currentTheme.colors).forEach(([key, value]) => {
      element.style.setProperty(`--color-${key}`, value);
    });
    
    Object.entries(this.currentTheme.spacing).forEach(([key, value]) => {
      element.style.setProperty(`--spacing-${key}`, value);
    });
  }
}
