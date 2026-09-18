import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="entry/[id]" options={{ title: '记录详情' }} />
        <Stack.Screen name="place/[id]" options={{ title: '地点' }} />
        <Stack.Screen name="ai-confirm" options={{ title: 'AI 整理' }} />
        <Stack.Screen name="tags" options={{ title: '标签' }} />
        <Stack.Screen name="conflicts" options={{ title: '冲突裁决' }} />
      </Stack>
    </>
  );
}
