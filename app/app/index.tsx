import { Redirect } from 'expo-router'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAuth } from '@/contexts/AuthContext'
import { colors } from '@/theme/theme'

export default function IndexScreen() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!user) {
    return <Redirect href="/(auth)/welcome" />
  }

  if (!profile) {
    return <Redirect href="/(auth)/create-profile" />
  }

  return <Redirect href="/(app)/home" />
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
})
