import { Tabs } from 'expo-router';

import { useTheme } from '@/themeProvider';

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      screenOptions={{
        // 主题换装：标签栏与页头随当前调色板走（对齐 Web 全站配色切换）。
        tabBarActiveTintColor: palette.terra,
        tabBarInactiveTintColor: palette.inkMuted,
        tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.line },
        headerStyle: { backgroundColor: palette.paper },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '画廊' }} />
      <Tabs.Screen name="record" options={{ title: '记录' }} />
      <Tabs.Screen name="find" options={{ title: '发现' }} />
      <Tabs.Screen name="mine" options={{ title: '我的' }} />
    </Tabs>
  );
}
