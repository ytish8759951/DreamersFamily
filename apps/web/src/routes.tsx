import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { ParentLayout } from './components/layout/ParentLayout';
import { ChildLayout } from './components/layout/ChildLayout';
import { Children } from './pages/parent/Children';
import { Tasks } from './pages/parent/Tasks';
import { Wishes } from './pages/parent/Wishes';
import { Cards } from './pages/parent/Cards';
import { Albums } from './pages/parent/Albums';
import { SpecialDays } from './pages/parent/SpecialDays';
import { Settings } from './pages/parent/Settings';
import { Growth } from './pages/parent/Growth';
import { MemoryBook } from './pages/parent/MemoryBook';
import { ParentScreenTime } from './pages/parent/ScreenTime';
import { Dashboard } from './pages/parent/Dashboard';
import { ChildHome } from './pages/child/Home';
import { TodayTasks } from './pages/child/TodayTasks';
import { ShareGrowth } from './pages/child/ShareGrowth';
import { MyDreams } from './pages/child/MyDreams';
import { LoveMailbox } from './pages/child/LoveMailbox';
import { GrowthReview } from './pages/child/GrowthReview';
import { ChildHonorWall } from './pages/child/HonorWall';
import { ChildSpecialDays } from './pages/child/SpecialDays';
import { ChildScreenTime } from './pages/child/ScreenTime';
import { ChildTokenEntry } from './pages/child/ChildTokenEntry';
import { DesignSystemPreview } from './pages/preview/DesignSystemPreview';
import { AuthPage } from './pages/auth/AuthPage';
import { JoinFamilyPage } from './pages/auth/JoinFamilyPage';
import { CreateFamilyPage } from './pages/auth/CreateFamilyPage';
import { JoinParentDevicePage } from './pages/auth/JoinParentDevicePage';
import { dataMode } from './lib/dataRepository';
import { useLocalDataState } from './lib/useLocalData';
import { useSupabaseRuntimeInfo } from './lib/useSupabaseRuntimeInfo';

function RootRedirect() {
  const location = useLocation();
  const state = useLocalDataState();
  const runtimeInfo = useSupabaseRuntimeInfo();
  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'initializing') {
    return <div className="auth-page">正在載入家庭資料...</div>;
  }
  if (dataMode === 'supabase' && runtimeInfo.authStatus !== 'ready') {
    return <Navigate to={runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login'} replace />;
  }
  if (location.pathname === '/' && (state.currentChildIdentity || state.deviceBinding)) {
    return <Navigate to="/child/home" replace />;
  }

  return <Navigate to={state.currentChildIdentity?.childId || state.deviceBinding ? '/child/home' : '/parent'} replace />;
}

function RequireParentAuth() {
  const runtimeInfo = useSupabaseRuntimeInfo();
  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'initializing') {
    return <div className="auth-page">正在載入家庭資料...</div>;
  }
  if (dataMode === 'supabase' && runtimeInfo.authStatus !== 'ready') {
    return <Navigate to={runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login'} replace />;
  }
  return <ParentLayout />;
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <AuthPage /> },
  { path: '/join', element: <JoinFamilyPage /> },
  { path: '/join-parent/:token', element: <JoinParentDevicePage /> },
  { path: '/create-family', element: <CreateFamilyPage /> },
  { path: '/preview/design-system', element: <DesignSystemPreview /> },
  {
    path: '/parent',
    element: <RequireParentAuth />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'children', element: <Children /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'dreams', element: <Wishes /> },
      { path: 'wishes', element: <Navigate to="/parent/dreams" replace /> },
      { path: 'badges', element: <Navigate to="/parent/children" replace /> },
      { path: 'mailbox', element: <Cards /> },
      { path: 'cards', element: <Navigate to="/parent/mailbox" replace /> },
      { path: 'share', element: <Albums /> },
      { path: 'albums', element: <Navigate to="/parent/share" replace /> },
      { path: 'honor-wall', element: <Navigate to="/parent/children" replace /> },
      { path: 'special-days', element: <SpecialDays /> },
      { path: 'growth', element: <Growth /> },
      { path: 'memory-book', element: <MemoryBook /> },
      { path: 'screen-time', element: <ParentScreenTime /> },
      { path: 'settings', element: <Settings /> }
    ]
  },
  {
    path: '/child',
    element: <ChildLayout />,
    children: [
      { index: true, element: <Navigate to="/child/home" replace /> },
      { path: 'home', element: <ChildHome /> },
      { path: 'tasks', element: <TodayTasks /> },
      { path: 'share', element: <ShareGrowth /> },
      { path: 'dreams', element: <MyDreams /> },
      { path: 'mailbox', element: <LoveMailbox /> },
      { path: 'honor-wall', element: <ChildHonorWall /> },
      { path: 'special-days', element: <ChildSpecialDays /> },
      { path: 'screen-time', element: <ChildScreenTime /> },
      { path: 'growth', element: <GrowthReview /> }
    ]
  },
  {
    path: '/child/:token',
    element: <ChildTokenEntry />
  }
]);
