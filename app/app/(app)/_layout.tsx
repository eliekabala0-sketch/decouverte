import { Redirect, Tabs } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppFeatureFlags } from '@/lib/useAppFeatureFlags'
import { useNotificationCounters } from '@/lib/useNotificationCounters'
import { Ionicons } from '@expo/vector-icons'
import { Platform, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function AppLayout() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { user, profile, loading, signOut } = useAuth()
  const { isOn } = useAppFeatureFlags()
  const { unreadMessages, newPublications } = useNotificationCounters()

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />
  if (!loading && user && profile && profile.status !== 'active') {
    const label = profile.status === 'banned'
      ? 'Votre compte est banni.'
      : profile.status === 'deleted'
        ? 'Ce compte a ete supprime.'
        : 'Votre compte est suspendu.'
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 12 }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 15, marginBottom: 20 }}>
          Contactez l'administration si vous pensez qu'il s'agit d'une erreur.
        </Text>
        <Pressable onPress={() => void signOut()} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 12 }}>
          <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: '700' }}>Se deconnecter</Text>
        </Pressable>
      </View>
    )
  }

  if (!loading && user && profile && !profile.photo) return <Redirect href="/(auth)/add-avatar" />

  const showPublications = isOn('public_publications_enabled')

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64 + Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 8),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 18 : 8),
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profiles"
        options={{
          title: 'Profils',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="publications"
        options={{
          title: 'Publications',
          href: showPublications ? undefined : null,
          tabBarBadge: newPublications > 0 ? newPublications : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="newspaper" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="payments"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="packs"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="conversation/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="announcements"
        options={{ href: null }}
      />
    </Tabs>
  )
}
