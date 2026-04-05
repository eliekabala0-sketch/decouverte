export const colors = {
  background: '#0D0D0F',
  surface: '#16161A',
  surfaceElevated: '#1E1E24',
  card: '#25252D',
  border: 'rgba(255,255,255,0.08)',
  text: '#FAFAFA',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.45)',
  primary: '#E8436C',
  primarySoft: 'rgba(232,67,108,0.2)',
  accent: '#7C3AED',
  accentSoft: 'rgba(124,58,237,0.2)',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  gold: '#FBBF24',
  neutralAvatar: '#3F3F46',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const },
  title2: { fontSize: 22, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 14, fontWeight: '400' as const },
  captionBold: { fontSize: 14, fontWeight: '600' as const },
  small: { fontSize: 12, fontWeight: '400' as const },
} as const
