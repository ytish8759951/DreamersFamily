import { useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError } from 'react-router-dom';
import { ChildLayout } from './components/layout/ChildLayout';
import { ParentLayout } from './components/layout/ParentLayout';
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
import { getLoggedInFamilyLandingPath } from './lib/familyLanding';
import { useLocalDataState } from './lib/useLocalData';
import { useSupabaseRuntimeInfo } from './lib/useSupabaseRuntimeInfo';
import { restoreDocumentInteractionState } from './lib/touchInteractions';

console.log('ROUTER MODULE START', {
  href: typeof window !== 'undefined' ? window.location.href : null,
  pathname: typeof window !== 'undefined' ? window.location.pathname : null
});

function RouteMatchTrace({ name }: { name: string }) {
  const location = useLocation();

  useEffect(() => {
    console.log('ROUTE MATCH', {
      name,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash
    });
  }, [location.hash, location.pathname, location.search, name]);

  return <Outlet />;
}

function RouteErrorFallback({ label }: { label: string }) {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';

  console.error('ROUTE RENDER FAILED', {
    label,
    message,
    stack,
    error
  });

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1>ROUTER FAILED</h1>
      <p>{label}</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
        {message}
        {'\n'}
        {stack}
      </pre>
    </main>
  );
}

function hasParentAccess(runtimeInfo: ReturnType<typeof useSupabaseRuntimeInfo>) {
  return Boolean(runtimeInfo.familyId || runtimeInfo.parentId);
}

function RootRedirect() {
  const state = useLocalDataState();
  const runtimeInfo = useSupabaseRuntimeInfo();

  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'initializing') {
    return <div className="auth-page">Loading...</div>;
  }

  if (dataMode === 'supabase' && runtimeInfo.authStatus !== 'ready') {
    const path = runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login';
    console.log('[auth trace] navigate()', { from: 'RootRedirect', to: path, runtimeInfo });
    return <Navigate to={path} replace />;
  }

  if (dataMode === 'supabase' && !hasParentAccess(runtimeInfo)) {
    console.log('[auth trace] navigate()', { from: 'RootRedirect', to: '/login', runtimeInfo });
    return <Navigate to="/login" replace />;
  }

  const path = getLoggedInFamilyLandingPath(state, runtimeInfo);
  console.log('[auth trace] navigate()', { from: 'RootRedirect', to: path, runtimeInfo });
  return <Navigate to={path} replace />;
}

function RequireFamilyAccess() {
  const runtimeInfo = useSupabaseRuntimeInfo();
  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'initializing') {
    return <div className="auth-page">Loading...</div>;
  }
  if (dataMode === 'supabase' && runtimeInfo.authStatus !== 'ready' && !hasParentAccess(runtimeInfo)) {
    const path = runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login';
    console.log('[auth trace] navigate()', { from: 'RequireFamilyAccess', to: path, runtimeInfo });
    return <Navigate to={path} replace />;
  }
  return <Outlet />;
}

function ParentIndexRedirect() {
  const runtimeInfo = useSupabaseRuntimeInfo();

  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'initializing') {
    return <div className="auth-page">Loading...</div>;
  }

  if (dataMode === 'supabase' && runtimeInfo.authStatus !== 'ready' && !hasParentAccess(runtimeInfo)) {
    const path = runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login';
    console.log('[auth trace] navigate()', { from: 'ParentIndexRedirect', to: path, runtimeInfo });
    return <Navigate to={path} replace />;
  }

  console.log('[auth trace] navigate()', { from: 'ParentIndexRedirect', to: '/parent/share', runtimeInfo });
  return <Navigate to="/parent/share" replace />;
}

function RequireCreateFamilyAccess() {
  const state = useLocalDataState();
  const runtimeInfo = useSupabaseRuntimeInfo();
  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'initializing') {
    return <div className="auth-page">Loading...</div>;
  }
  if (dataMode === 'supabase' && hasParentAccess(runtimeInfo)) {
    const path = getLoggedInFamilyLandingPath(state, runtimeInfo);
    console.log('[auth trace] navigate()', { from: 'RequireCreateFamilyAccess', to: path, runtimeInfo });
    return <Navigate to={path} replace />;
  }
  if (dataMode === 'supabase' && runtimeInfo.authStatus === 'signed_out') {
    console.log('[auth trace] navigate()', { from: 'RequireCreateFamilyAccess', to: '/login', runtimeInfo });
    return <Navigate to="/login" replace />;
  }
  return <CreateFamilyPage />;
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect />, errorElement: <RouteErrorFallback label="Root route failed" /> },
  { path: '/login', element: <AuthPage />, errorElement: <RouteErrorFallback label="/login route failed" /> },
  { path: '/join', element: <JoinFamilyPage />, errorElement: <RouteErrorFallback label="/join route failed" /> },
  {
    path: '/join-parent/:token',
    element: <JoinParentDevicePage />,
    errorElement: <RouteErrorFallback label="/join-parent/:token route failed" />
  },
  {
    path: '/create-family',
    element: <RequireCreateFamilyAccess />,
    errorElement: <RouteErrorFallback label="/create-family route failed" />
  },
  {
    path: '/create-child',
    element: <RequireFamilyAccess />,
    errorElement: <RouteErrorFallback label="/create-child route failed" />,
    children: [
      {
        element: <ParentLayout />,
        children: [{ index: true, element: <Children /> }]
      }
    ]
  },
  {
    path: '/preview/design-system',
    element: <DesignSystemPreview />,
    errorElement: <RouteErrorFallback label="/preview/design-system route failed" />
  },
  {
    path: '/parent',
    element: <RequireFamilyAccess />,
    errorElement: <RouteErrorFallback label="/parent route failed" />,
    children: [
      { index: true, element: <ParentIndexRedirect /> },
      {
        element: <ParentLayout />,
        children: [
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
      }
    ]
  },
  {
    path: '/child',
    element: <RouteMatchTrace name="/child" />,
    errorElement: <RouteErrorFallback label="/child route failed" />,
    children: [
      {
        element: <ChildLayout />,
        errorElement: <RouteErrorFallback label="ChildLayout route failed" />,
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
          { path: 'growth', element: <GrowthReview /> },
          { path: ':token', element: <ChildTokenEntry /> }
        ]
      }
    ]
  }
]);

if (typeof window !== 'undefined') {
  router.subscribe((state) => {
    restoreDocumentInteractionState();
    console.log('[auth trace] final route', {
      route: `${state.location.pathname}${state.location.search}${state.location.hash}`,
      navigationState: state.navigation.state
    });
  });
}
