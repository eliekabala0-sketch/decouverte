import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#0D0D0F' },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="create-profile" />
      <Stack.Screen name="add-avatar" options={{ presentation: 'card' }} />
      <Stack.Screen name="edit-profile" />
    </Stack>
  )
}
