import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
import { ensureSeeded } from './lib/demo'
import { autoSync, startRealtime, stopRealtime } from './lib/sync'
import { onAuthChange } from './lib/supabase'
import { cloudConfigured } from './lib/env'
import { initTheme } from './lib/theme'

initTheme()

// 首屏：播种默认标签与演示数据（可一键清除），随后尝试自动同步
ensureSeeded().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
  autoSync().catch(() => {})
  window.addEventListener('online', () => autoSync().catch(() => {}))
  // Realtime 仅通知（规范 V1.2 §9.1）：已登录才订阅自己 Schema 的变化，登出即断开
  onAuthChange((s) => {
    if (s && cloudConfigured()) startRealtime().catch(() => {})
    else stopRealtime()
  })
})
