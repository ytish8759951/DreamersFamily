import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInParentWithPassword, signOutParent, signUpParentWithPassword } from '../../lib/supabaseData';
import { settingsRepository } from '../../lib/settingsRepository';
import { useSupabaseRuntimeInfo } from '../../lib/useSupabaseRuntimeInfo';

function stringifyUnknown(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatAuthError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return stringifyUnknown(error);
  }

  const source = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    status?: unknown;
    response?: unknown;
    networkError?: unknown;
  };

  const lines = [
    source.message !== undefined ? `message: ${stringifyUnknown(source.message)}` : null,
    source.code !== undefined ? `code: ${stringifyUnknown(source.code)}` : null,
    source.details !== undefined ? `details: ${stringifyUnknown(source.details)}` : null,
    source.hint !== undefined ? `hint: ${stringifyUnknown(source.hint)}` : null,
    source.status !== undefined ? `status: ${stringifyUnknown(source.status)}` : null,
    source.response !== undefined ? `response: ${stringifyUnknown(source.response)}` : null,
    source.networkError !== undefined ? `networkError: ${stringifyUnknown(source.networkError)}` : null
  ].filter(Boolean);

  return lines.length ? lines.join('\n') : stringifyUnknown(error);
}

export function AuthPage() {
  const navigate = useNavigate();
  const runtimeInfo = useSupabaseRuntimeInfo();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (runtimeInfo.familyId || runtimeInfo.parentId) {
      navigate('/parent', { replace: true });
    }
  }, [navigate, runtimeInfo.familyId, runtimeInfo.parentId]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');

    try {
      if (mode === 'signin') {
        const runtime = await signInParentWithPassword(email, password);
        settingsRepository.updateSettings({ parent_email: email });
        navigate(runtime.familyId || runtime.parentId ? '/parent' : '/create-family', { replace: true });
        return;
      }

      const runtime = await signUpParentWithPassword(email, password, displayName);
      settingsRepository.updateSettings({
        parent_email: email,
        parent_name: displayName.trim() || email.split('@')[0] || '家長'
      });
      navigate(runtime.familyId || runtime.parentId ? '/parent' : '/create-family', { replace: true });
    } catch (caught) {
      console.error(caught);
      setMessage(formatAuthError(caught));
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
          <h1>{mode === 'signup' ? '建立帳號' : '登入'}</h1>
          <p>{mode === 'signup' ? '先建立帳號，再自動進入建立家庭流程。' : '登入後直接進入家庭首頁。'}</p>
        </header>

        <form onSubmit={submitAuth}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
              建立帳號
            </button>
            <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>
              登入
            </button>
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

        {message ? <pre className="auth-message" style={{ whiteSpace: 'pre-wrap' }}>{message}</pre> : null}
      </section>
    </main>
  );
}
