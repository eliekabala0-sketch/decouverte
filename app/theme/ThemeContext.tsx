import React, { createContext, useContext } from 'react'
import { colors, spacing, borderRadius, typography } from './theme'

type Theme = {
  colors: typeof colors
  spacing: typeof spacing
  borderRadius: typeof borderRadius
  typography: typeof typography
}

const theme: Theme = { colors, spacing, borderRadius, typography }
const ThemeContext = createContext<Theme>(theme)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const t = useContext(ThemeContext)
  if (!t) throw new Error('useTheme must be used within ThemeProvider')
  return t
}
