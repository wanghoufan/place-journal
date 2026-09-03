// 底部导航：对称三入口 画廊 / 找地点 / 我的 + 悬浮「记录」主按钮（方案 3.1）
import { NavLink, useNavigate } from 'react-router-dom'

const IconGallery = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? '#c65d21' : 'none'} stroke={active ? '#c65d21' : '#8a7f6d'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M4 18l5-5 4 4 3-3 4 4" />
  </svg>
)
const IconFind = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? '#c65d21' : 'none'} stroke={active ? '#c65d21' : '#8a7f6d'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" />
  </svg>
)
const IconMine = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? '#c65d21' : 'none'} stroke={active ? '#c65d21' : '#8a7f6d'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c1.4-3.4 4.2-5 7.5-5s6.1 1.6 7.5 5" />
  </svg>
)

export default function Nav() {
  const nav = useNavigate()
  const tabCls = ({ isActive }: { isActive: boolean }) => `flex flex-col items-center gap-0.5 pt-2 pb-1 px-6 text-[11px] ${isActive ? 'text-terra font-bold' : 'text-inkmuted'}`
  // 图标颜色跟随激活态
  const tabs = [
    { to: '/', label: '画廊', Icon: IconGallery, end: true },
    { to: '/find', label: '找地点', Icon: IconFind, end: false },
    { to: '/mine', label: '我的', Icon: IconMine, end: false },
  ]
  return (
    <>
      <button
        onClick={() => nav('/record')}
        aria-label="记录"
        className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(64px+env(safe-area-inset-bottom))] w-[68px] h-[68px] rounded-full bg-terra text-[#fff7ee] text-lg font-bold shadow-pop border-4 border-paper active:scale-95 transition"
      >
        记录
      </button>
      <nav className="fixed z-30 bottom-0 inset-x-0 mx-auto max-w-md bg-card/95 backdrop-blur border-t border-line/70 flex justify-around items-end pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={tabCls}>
            {({ isActive }) => (<><Icon active={isActive} /><span>{label}</span></>)}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
