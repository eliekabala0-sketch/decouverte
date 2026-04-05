import { View, Platform, type ViewStyle } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider } from '@/theme/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'

const rootStyle: ViewStyle = {
  flex: 1,
  ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as unknown as ViewStyle) : {}),
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={rootStyle}>
      <SafeAreaProvider style={rootStyle}>
        <View style={rootStyle}>
        <ThemeProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0D0D0F' },
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" options={{ animation: 'fade' }} />
            </Stack>
          </AuthProvider>
        </ThemeProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
