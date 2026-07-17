import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deviceBindingRepository } from '../../lib/deviceBindingRepository';
import { getErrorMessage, serializeError } from '../../lib/errorDiagnostics';

type ChallengeState =
  | { status: 'loading' }
  | { status: 'ready'; childName: string; expiresAt: string; remainingAttempts: number }
  | { status: 'error'; message: string; details?: string };

const PIN_LENGTH = 4;

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

function pinDigitsFromText(text: string) {
  return text.replace(/\D/g, '').slice(0, PIN_LENGTH).split('');
}

export function ChildLoginChallengeEntry() {
  const { challengeToken = '' } = useParams();
  const navigate = useNavigate();
  const token = useMemo(() => challengeToken.trim(), [challengeToken]);
  const [challenge, setChallenge] = useState<ChallengeState>({ status: 'loading' });
  const [pinDigits, setPinDigits] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const formRef = useRef<HTMLFormElement | null>(null);

  const pin = pinDigits.join('');
  const canSubmit = challenge.status === 'ready' && pin.length === PIN_LENGTH && !submitting;

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

  useEffect(() => {
    if (challenge.status !== 'ready') return;
    const handle = window.setTimeout(() => {
      inputRefs.current[0]?.focus();
      formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
    return () => window.clearTimeout(handle);
  }, [challenge.status]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const keepFormVisible = () => {
      formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    window.visualViewport.addEventListener('resize', keepFormVisible);
    window.visualViewport.addEventListener('scroll', keepFormVisible);
    return () => {
      window.visualViewport?.removeEventListener('resize', keepFormVisible);
      window.visualViewport?.removeEventListener('scroll', keepFormVisible);
    };
  }, []);

  const focusInput = (index: number) => {
    const nextIndex = Math.max(0, Math.min(PIN_LENGTH - 1, index));
    inputRefs.current[nextIndex]?.focus();
    inputRefs.current[nextIndex]?.select();
  };

  const fillDigits = (startIndex: number, digits: string[]) => {
    if (!digits.length) return;
    setSubmitError('');
    setPinDigits((current) => {
      const next = [...current];
      digits.forEach((digit, offset) => {
        const index = startIndex + offset;
        if (index < PIN_LENGTH) next[index] = digit;
      });
      return next;
    });
    window.requestAnimationFrame(() => focusInput(Math.min(startIndex + digits.length, PIN_LENGTH - 1)));
  };

  const handleDigitChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const digits = pinDigitsFromText(event.target.value);
    if (!digits.length) {
      setPinDigits((current) => {
        const next = [...current];
        next[index] = '';
        return next;
      });
      return;
    }
    fillDigits(index, digits);
  };

  const handleDigitPaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const digits = pinDigitsFromText(event.clipboardData.getData('text'));
    if (!digits.length) return;
    event.preventDefault();
    fillDigits(index, digits);
  };

  const handleDigitKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.key === 'Backspace' && !pinDigits[index] && index > 0) {
      event.preventDefault();
      setPinDigits((current) => {
        const next = [...current];
        next[index - 1] = '';
        return next;
      });
      window.requestAnimationFrame(() => focusInput(index - 1));
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusInput(index + 1);
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
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
      setSubmitError(code === 'PIN_INCORRECT' ? 'PIN 錯誤，請重新確認。' : getErrorMessage(error) || '登入失敗，請重新確認。');
    } finally {
      setSubmitting(false);
    }
  };

  const returnToQrScan = () => {
    navigate('/child', { replace: true });
  };

  if (challenge.status === 'loading') {
    return (
      <main className="child-device-entry child-login-entry">
        <section className="child-login-card">
          <h1>正在讀取孩子登入 QR</h1>
          <p>請稍候。</p>
        </section>
      </main>
    );
  }

  if (challenge.status === 'error') {
    return (
      <main className="child-device-entry child-login-entry">
        <section className="child-login-card">
          <span>!</span>
          <h1>需要重新產生孩子登入 QR</h1>
          <p>{challenge.message}</p>
          {challenge.details ? <pre>{challenge.details}</pre> : null}
          <button type="button" className="child-login-secondary" onClick={returnToQrScan}>
            返回 QR 掃描
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="child-device-entry child-login-entry">
      <section className="child-login-card">
        <span>PIN</span>
        <h1>{challenge.childName}</h1>
        <p>請輸入家長畫面上的 4 位數 PIN。</p>
        <form ref={formRef} className="child-login-form" onSubmit={submit}>
          <div className="child-login-otp" role="group" aria-label="4 位數 PIN">
            {pinDigits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                className="child-login-otp-input"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(event) => handleDigitChange(index, event)}
                onPaste={(event) => handleDigitPaste(index, event)}
                onKeyDown={(event) => handleDigitKeyDown(index, event)}
                onFocus={(event) => event.currentTarget.select()}
                aria-label={`PIN 第 ${index + 1} 碼`}
                disabled={submitting}
              />
            ))}
          </div>

          {submitError ? <p className="child-login-error" role="alert">{submitError}</p> : null}

          <footer className="child-login-footer">
            <button type="submit" className="child-login-primary" disabled={!canSubmit}>
              {submitting ? '登入中...' : '登入'}
            </button>
            <button type="button" className="child-login-secondary" onClick={returnToQrScan} disabled={submitting}>
              返回 QR 掃描
            </button>
          </footer>
        </form>
        <p>剩餘嘗試次數：{remainingAttempts ?? challenge.remainingAttempts}</p>
        <p>有效期限：{new Date(challenge.expiresAt).toLocaleString('zh-TW')}</p>
      </section>
    </main>
  );
}
