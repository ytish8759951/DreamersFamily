import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProductionFamily } from '../../lib/supabaseData';
import { settingsRepository } from '../../lib/settingsRepository';

const DEFAULT_FAMILY_NAME = '小小夢想家 Family';

export function CreateFamilyPage() {
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      const nextFamilyName = familyName.trim() || DEFAULT_FAMILY_NAME;
      await createProductionFamily(nextFamilyName);
      settingsRepository.updateSettings({ family_name: nextFamilyName });
      navigate('/parent', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '建立家庭失敗');
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <small>Dreamers Family V1.1</small>
          <h1>建立家庭</h1>
          <p>第一次登入後，請先建立自己的家庭。不同家庭會使用不同 familyId，資料完全隔離。</p>
        </header>
        <form onSubmit={submit}>
          <label>
            家庭名稱（可選填）
            <input
              autoFocus
              placeholder={DEFAULT_FAMILY_NAME}
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
            />
          </label>
          <button className="ds-primary-button" type="submit">建立家庭</button>
        </form>
        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
