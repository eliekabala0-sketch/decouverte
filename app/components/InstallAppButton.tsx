import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from '@/theme/ThemeContext'
import { usePwaInstall } from '@/lib/usePwaInstall'

export function InstallAppButton() {
  const { colors } = useTheme()
  const { canInstall, install } = usePwaInstall()

  if (!canInstall) return null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Installer Découverte"
      onPress={() => void install()}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.primary,
          backgroundColor: colors.primarySoft,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons name="download-outline" size={21} color={colors.primary} />
      <Text style={[styles.label, { color: colors.primary }]}>Installer Découverte</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
})
