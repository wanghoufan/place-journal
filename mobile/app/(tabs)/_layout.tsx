import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '画廊' }} />
      <Tabs.Screen name="record" options={{ title: '记录' }} />
      <Tabs.Screen name="find" options={{ title: '发现' }} />
      <Tabs.Screen name="mine" options={{ title: '我的' }} />
    </Tabs>
  );
}
