import { Redirect, Tabs } from 'expo-router'
import { useTheme } from '@/theme/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { Ionicons } from '@expo/vector-icons'

export default function AppLayout() {
  const { colors } = useTheme()
  const { user, profile, loading } = useAuth()

  if (!loading && !user) return <Redirect href="/(auth)/welcome" />
  if (!loading && user && !profile) return <Redirect href="/(auth)/create-profile" />
  if (!loading && user && profile && !profile.photo) return <Redirect href="/(auth)/add-avatar" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
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
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="publications"
        options={{
          title: 'Publications',
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
