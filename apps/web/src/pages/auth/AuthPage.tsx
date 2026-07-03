import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  createProductionFamily,
  joinProductionFamily,
  signInParentWithPassword,
  signOutParent,
  signUpParentWithPassword
} from '../../lib/supabaseData';
import { useSupabaseRuntimeInfo } from '../../lib/useSupabaseRuntimeInfo';

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runtimeInfo = useSupabaseRuntimeInfo();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('Dreamers Family');
  const [inviteFamilyId, setInviteFamilyId] = useState(searchParams.get('familyId') ?? '');
  const [inviteCode, setInviteCode] = useState(searchParams.get('inviteCode') ?? '');
  const [message, setMessage] = useState('');
  const isJoinIntent = useMemo(() => Boolean(searchParams.get('familyId') && searchParams.get('inviteCode')), [searchParams]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      if (mode === 'signin') await signInParentWithPassword(email, password);
      else await signUpParentWithPassword(email, password, displayName);
      setMessage(mode === 'signin' ? '登入成功' : '帳號已建立，請依 Supabase email 設定完成驗證後登入。');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '登入失敗');
    }
  };

  const createFamily = async () => {
    setMessage('');
    try {
      await createProductionFamily(familyName);
      setMessage('家庭已建立');
      navigate('/parent', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '建立家庭失敗');
    }
  };

  const joinFamily = async () => {
    setMessage('');
    try {
      await joinProductionFamily(inviteFamilyId, inviteCode);
      setMessage('已加入家庭');
      navigate('/parent', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '加入家庭失敗');
    }
  };

  const logout = async () => {
    await signOutParent();
    setMessage('已登出');
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <small>Dreamers Family V1.1</small>
          <h1>家長登入</h1>
          <p>每位家長使用自己的 Supabase Auth 帳號。所有資料依 familyId 同步。</p>
        </header>

        <form onSubmit={submitAuth}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>登入</button>
            <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>建立帳號</button>
          </div>
          {mode === 'signup' ? (
            <label>顯示名稱<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          ) : null}
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="ds-primary-button" type="submit">{mode === 'signin' ? '登入' : '建立帳號'}</button>
        </form>

        <div className="auth-provider-row">
          <button type="button" disabled>Google 登入（預留）</button>
          <button type="button" disabled>Apple 登入（預留）</button>
        </div>

        <section className="auth-family-actions">
          <h2>家庭設定</h2>
          <p>登入後若尚未加入家庭，請建立新家庭或使用邀請碼加入既有家庭。</p>
          <label>新家庭名稱<input value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></label>
          <button type="button" onClick={() => void createFamily()} disabled={!runtimeInfo.userId}>建立新家庭</button>
          <label>familyId<input value={inviteFamilyId} onChange={(event) => setInviteFamilyId(event.target.value)} /></label>
          <label>inviteCode<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} /></label>
          <button type="button" onClick={() => void joinFamily()} disabled={!runtimeInfo.userId || !inviteFamilyId || !inviteCode}>
            {isJoinIntent ? '使用連結加入家庭' : '加入既有家庭'}
          </button>
        </section>

        <footer>
          <code>auth={runtimeInfo.authStatus}</code>
          <code>userId={runtimeInfo.userId ?? '-'}</code>
          <code>familyId={runtimeInfo.familyId ?? '-'}</code>
          {runtimeInfo.userId ? <button type="button" onClick={() => void logout()}>登出</button> : null}
        </footer>
        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
