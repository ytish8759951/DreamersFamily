import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deviceBindingRepository } from '../../lib/deviceBindingRepository';
import { getErrorMessage, serializeError } from '../../lib/errorDiagnostics';

type ChallengeState =
  | { status: 'loading' }
  | { status: 'ready'; childName: string; expiresAt: string; remainingAttempts: number }
  | { status: 'error'; message: string; details?: string };

function errorCode(error: unknown) {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; details?: unknown };
    if (typeof record.details === 'string' && record.details.trim()) return record.details;
    if (typeof record.code === 'string' && record.code.trim()) return record.code;
  }
  return null;
}

function remainingAttemptsFromError(error: unknown) {
  if (error && typeof error === 'object') {
    const hint = (error as { hint?: unknown }).hint;
    if (typeof hint === 'string' && /^\d+$/.test(hint)) return Number(hint);
  }
  return null;
}

export function ChildLoginChallengeEntry() {
  const { challengeToken = '' } = useParams();
  const navigate = useNavigate();
  const token = useMemo(() => challengeToken.trim(), [challengeToken]);
  const [challenge, setChallenge] = useState<ChallengeState>({ status: 'loading' });
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChallenge({ status: 'loading' });
    setSubmitError('');
    setRemainingAttempts(null);
    void Promise.resolve(deviceBindingRepository.resolveChildLoginChallenge(token))
      .then((preview) => {
        if (cancelled) return;
        if (preview.status !== 'pending') {
          setChallenge({
            status: 'error',
            message: preview.status === 'used' ? '這組登入 QR 已使用' : '這組登入 QR 已失效',
            details: `status=${preview.status}`
          });
          return;
        }
        setRemainingAttempts(preview.remainingAttempts);
        setChallenge({
          status: 'ready',
          childName: preview.childName,
          expiresAt: preview.expiresAt,
          remainingAttempts: preview.remainingAttempts
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[child-login-challenge] resolve failed', { error, details: serializeError(error) });
        setChallenge({
          status: 'error',
          message: getErrorMessage(error) || '無法讀取孩子登入 QR',
          details: errorCode(error) ?? undefined
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || pin.length !== 4) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await Promise.resolve(deviceBindingRepository.completeChildLoginChallenge(token, pin));
      navigate(`/child/home?childId=${encodeURIComponent(result.childId)}`, { replace: true });
    } catch (error) {
      console.error('[child-login-challenge] complete failed', { error, details: serializeError(error) });
      const attempts = remainingAttemptsFromError(error);
      if (attempts !== null) setRemainingAttempts(attempts);
      const code = errorCode(error);
      const message = code === 'PIN_INCORRECT'
        ? `驗證碼錯誤，剩餘 ${attempts ?? remainingAttempts ?? 0} 次`
        : getErrorMessage(error) || '孩子登入失敗';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (challenge.status === 'loading') {
    return (
      <main className="child-device-entry">
        <section>
          <h1>正在讀取孩子登入 QR</h1>
          <p>請稍候。</p>
        </section>
      </main>
    );
  }

  if (challenge.status === 'error') {
    return (
      <main className="child-device-entry">
        <section>
          <span>!</span>
          <h1>需要重新產生孩子登入 QR</h1>
          <p>{challenge.message}</p>
          {challenge.details ? <pre>{challenge.details}</pre> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="child-device-entry">
      <section>
        <span>PIN</span>
        <h1>{challenge.childName}</h1>
        <p>請輸入家長端畫面上的 4 位驗證碼。</p>
        <form onSubmit={submit}>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-label="4 位驗證碼"
            autoFocus
          />
          <button type="submit" disabled={submitting || pin.length !== 4}>
            {submitting ? '驗證中' : '登入孩子平板'}
          </button>
        </form>
        <p>剩餘嘗試次數：{remainingAttempts ?? challenge.remainingAttempts}</p>
        <p>有效期限：{new Date(challenge.expiresAt).toLocaleString('zh-TW')}</p>
        {submitError ? <p role="alert">{submitError}</p> : null}
      </section>
    </main>
  );
}
