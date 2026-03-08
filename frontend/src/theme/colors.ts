export const lightColors = {
  background: '#f8f9fa',
  surface: '#ffffff',
  surfaceVariant: '#f1f3f5',
  primary: '#6366f1', // Modern indigo
  primaryVariant: '#4f46e5',
  secondary: '#06b6d4', // Cyan
  accent: '#8b5cf6', // Purple
  text: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  error: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  info: '#3b82f6',
  card: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.5)',
};

export const darkColors = {
  background: '#0f172a', // Deep slate
  surface: '#1e293b',
  surfaceVariant: '#334155',
  primary: '#818cf8', // Softer indigo for dark mode
  primaryVariant: '#6366f1',
  secondary: '#22d3ee', // Bright cyan
  accent: '#a78bfa', // Soft purple
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#64748b',
  border: '#334155',
  error: '#f87171',
  success: '#34d399',
  warning: '#fbbf24',
  info: '#60a5fa',
  card: '#1e293b',
  overlay: 'rgba(0, 0, 0, 0.75)',
};

export type ColorScheme = typeof lightColors;
