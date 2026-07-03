import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInParentWithPassword, signOutParent, signUpParentWithPassword } from '../../lib/supabaseData';
import { settingsRepository } from '../../lib/settingsRepository';
import { useSupabaseRuntimeInfo } from '../../lib/useSupabaseRuntimeInfo';

export function AuthPage() {
  const navigate = useNavigate();
  const runtimeInfo = useSupabaseRuntimeInfo();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      if (mode === 'signin') {
        await signInParentWithPassword(email, password);
        settingsRepository.updateSettings({
          parent_email: email
        });
        navigate('/parent', { replace: true });
        return;
      }

      await signUpParentWithPassword(email, password, displayName);
      settingsRepository.updateSettings({
        parent_email: email,
        parent_name: displayName.trim() || email.split('@')[0] || '家長'
      });
      navigate('/create-family', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '登入或建立帳號失敗');
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
          <small>Dreamers Family V1.2</small>
          <h1>家長登入與建立帳號</h1>
          <p>第一位家長建立帳號後會直接進入建立家庭；第二位家長請使用家長邀請 QR 綁定裝置，不需要建立帳號。</p>
        </header>

        <form onSubmit={submitAuth}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>建立帳號</button>
            <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>登入</button>
          </div>

          {mode === 'signup' ? (
            <label>
              顯示名稱
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="家長名稱"
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button className="ds-primary-button" type="submit">
            {mode === 'signup' ? '建立帳號' : '登入'}
          </button>
        </form>

        <footer>
          {runtimeInfo.userId ? <button type="button" onClick={() => void logout()}>登出</button> : null}
        </footer>

        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
