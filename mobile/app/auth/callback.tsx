// Auth scheme 回调入口（T054/T056/T062 本地段）。
//
// 两条入口共用同一 `handleCallback`，指纹去重保证重复/迟到回调幂等：
//   1) 正常登录：`login()` 内 `openAuthSessionAsync` 直接拿到回调 URL（不经过本页）；
//   2) 冷启动/被杀后由 scheme 唤起：本页经 `useLinkingURL()` 取 URL 并处理。
// 本页只展示结果文案，绝不打印 code/token。

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLinkingURL } from 'expo-linking';

import { getAuthService, isSupabaseConfigured, type CallbackOutcome } from '@/supabase';
import { describeCallbackOwnerMismatch } from '@/features/account';

type Tone = 'pending' | 'ok' | 'warn';

interface UiState {
  tone: Tone;
  text: string;
}

function describe(outcome: CallbackOutcome): UiState {
  switch (outcome.status) {
    case 'succeeded':
      return { tone: 'ok', text: outcome.binding === 'unbound' ? '登录成功，请回到 Mine 确认绑定本地数据。' : '登录成功。' };
    case 'duplicate':
      return { tone: 'ok', text: '该登录回调已处理过，无需重复操作。' };
    case 'owner_mismatch':
      return { tone: 'warn', text: describeCallbackOwnerMismatch() };
    case 'terminal_reauth':
      return { tone: 'warn', text: '登录未完成，请回 Mine 重新登录。' };
    default:
      return { tone: 'warn', text: '登录未完成，请回 Mine 重新登录。' };
  }
}

export default function AuthCallbackScreen() {
  const url = useLinkingURL();
  const [state, setState] = useState<UiState>({ tone: 'pending', text: '正在处理登录回调…' });
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!url || lastHandled.current === url) return;
    lastHandled.current = url;
    let cancelled = false;

    void (async () => {
      try {
        if (!isSupabaseConfigured()) {
          if (!cancelled) setState({ tone: 'warn', text: '未配置 Supabase 环境变量，无法完成登录。' });
          return;
        }
        const outcome = await getAuthService().handleCallback(url);
        if (!cancelled) setState(describe(outcome));
      } catch {
        if (!cancelled) setState({ tone: 'warn', text: '登录回调处理失败，请回 Mine 重新登录。' });
      } finally {
        // 处理完即释放：不在 ref 中长期持有含一次性 code 的回调 URL（缩小 code 内存存活窗口）。
        if (lastHandled.current === url) lastHandled.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <View style={styles.container}>
      {state.tone === 'pending' ? <ActivityIndicator /> : null}
      <Text style={styles.text}>{state.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  text: {
    textAlign: 'center',
    fontSize: 16,
  },
});
