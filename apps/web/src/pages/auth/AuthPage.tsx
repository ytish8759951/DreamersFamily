import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getProductionFamilyInvitePreview,
  joinProductionFamily,
  signInParentWithPassword,
  signOutParent,
  signUpParentWithPassword,
  updateProductionParentProfile
} from '../../lib/supabaseData';
import { settingsRepository } from '../../lib/settingsRepository';
import { useSupabaseRuntimeInfo } from '../../lib/useSupabaseRuntimeInfo';

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runtimeInfo = useSupabaseRuntimeInfo();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteFamilyId, setInviteFamilyId] = useState(searchParams.get('familyId') ?? '');
  const [inviteCode, setInviteCode] = useState(searchParams.get('inviteCode') ?? '');
  const [inviteFamilyName, setInviteFamilyName] = useState('');
  const [message, setMessage] = useState('');
  const isJoinIntent = useMemo(() => Boolean(searchParams.get('familyId') && searchParams.get('inviteCode')), [searchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!inviteFamilyId || !inviteCode) {
      setInviteFamilyName('');
      return;
    }
    void getProductionFamilyInvitePreview(inviteFamilyId, inviteCode)
      .then((preview) => {
        if (!cancelled) setInviteFamilyName(preview?.family_name ?? '');
      })
      .catch(() => {
        if (!cancelled) setInviteFamilyName('');
      });
    return () => {
      cancelled = true;
    };
  }, [inviteFamilyId, inviteCode]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      if (mode === 'signin') {
        await signInParentWithPassword(email, password);
        if (isJoinIntent) {
          await joinProductionFamily(inviteFamilyId, inviteCode);
          await updateProductionParentProfile(displayName, email);
          settingsRepository.updateSettings({
            family_name: inviteFamilyName || '小小夢想家 Family',
            parent_name: displayName.trim() || email.split('@')[0] || '家長',
            parent_email: email
          });
          setMessage('已登入並加入家庭');
          navigate('/parent', { replace: true });
        } else {
          navigate('/', { replace: true });
          setMessage('登入成功');
        }
      } else {
        await signUpParentWithPassword(email, password, displayName);
        if (isJoinIntent) {
          await joinProductionFamily(inviteFamilyId, inviteCode);
          await updateProductionParentProfile(displayName, email);
          settingsRepository.updateSettings({
            family_name: inviteFamilyName || '小小夢想家 Family',
            parent_name: displayName.trim() || email.split('@')[0] || '家長',
            parent_email: email
          });
          setMessage('帳號已建立，已加入家庭');
          navigate('/parent', { replace: true });
        } else {
          setMessage('帳號已建立，請建立家庭。');
          navigate('/create-family', { replace: true });
        }
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '登入失敗');
    }
  };

  const joinFamily = async () => {
    setMessage('');
    try {
      await joinProductionFamily(inviteFamilyId, inviteCode);
      await updateProductionParentProfile(displayName, email);
      settingsRepository.updateSettings({
        family_name: inviteFamilyName || '小小夢想家 Family',
        parent_name: displayName.trim() || email.split('@')[0] || '家長',
        parent_email: email
      });
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
          <h2>家庭加入</h2>
          {inviteFamilyName ? <p className="auth-invite-preview">你即將加入：<strong>【{inviteFamilyName}】</strong></p> : null}
          <p>第二位家長掃描 QR Code 或開啟邀請連結後，建立帳號或登入即可自動加入同一個 familyId。</p>
          <label>familyId<input value={inviteFamilyId} onChange={(event) => setInviteFamilyId(event.target.value)} /></label>
          <label>inviteCode<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} /></label>
          <button type="button" onClick={() => void joinFamily()} disabled={!runtimeInfo.userId || !inviteFamilyId || !inviteCode}>
            {isJoinIntent ? '使用連結加入家庭' : '加入既有家庭'}
          </button>
        </section>

        <footer>
          {runtimeInfo.authStatus === 'needs_family' ? <button type="button" onClick={() => navigate('/create-family')}>建立家庭</button> : null}
          {runtimeInfo.userId ? <button type="button" onClick={() => void logout()}>登出</button> : null}
        </footer>
        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
