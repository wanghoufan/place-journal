import { Routes, Route } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Gallery from './pages/Gallery'
import Find from './pages/Find'
import Mine from './pages/Mine'
import Record from './pages/Record'
import AiConfirm from './pages/AiConfirm'
import EntryDetail from './pages/EntryDetail'
import PlaceDetail from './pages/PlaceDetail'
import TagsPage from './pages/TagsPage'
import ShareSingle from './pages/ShareSingle'
import ShareList from './pages/ShareList'

export default function App() {
  const { pathname } = useLocation()
  const isFlow = pathname === '/record' || pathname === '/confirm'
  const isShare = pathname.startsWith('/s/')
  return (
    <div className="mx-auto max-w-md min-h-screen bg-paper relative">
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/find" element={<Find />} />
        <Route path="/mine" element={<Mine />} />
        <Route path="/record" element={<Record />} />
        <Route path="/confirm" element={<AiConfirm />} />
        <Route path="/entry/:id" element={<EntryDetail />} />
        <Route path="/place/:id" element={<PlaceDetail />} />
        <Route path="/tags" element={<TagsPage />} />
        {/* 公开分享路由：无需登录 */}
        <Route path="/s/p/:slug" element={<ShareSingle />} />
        <Route path="/s/l/:slug" element={<ShareList />} />
        <Route path="*" element={<div className="p-10 text-center text-inkmuted">页面不存在</div>} />
      </Routes>
      {/* 记录/AI 确认是全屏流程页：隐藏底部导航与悬浮「记录」按钮，避免遮挡表单 */}
      {!isShare && !isFlow && <Nav />}
    </div>
  )
}
