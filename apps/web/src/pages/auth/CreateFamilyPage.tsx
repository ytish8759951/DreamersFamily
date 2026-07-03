import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProductionFamily, updateProductionParentProfile } from '../../lib/supabaseData';
import { settingsRepository } from '../../lib/settingsRepository';

const DEFAULT_FAMILY_NAME = '小小夢想家 Family';

export function CreateFamilyPage() {
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      const nextFamilyName = familyName.trim() || DEFAULT_FAMILY_NAME;
      await createProductionFamily(nextFamilyName);
      await updateProductionParentProfile(parentName, parentEmail);
      settingsRepository.updateSettings({
        family_name: nextFamilyName,
        parent_name: parentName.trim() || '家長',
        parent_email: parentEmail.trim()
      });
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
          <p>第一次登入後，請先建立自己的家庭與第一位家長資料。完成後你會成為 Owner。</p>
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
          <label>
            第一位家長名稱
            <input
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
              placeholder="家長"
            />
          </label>
          <label>
            家長 Email
            <input
              type="email"
              value={parentEmail}
              onChange={(event) => setParentEmail(event.target.value)}
              placeholder="parent@example.com"
            />
          </label>
          <button className="ds-primary-button" type="submit">建立家庭</button>
        </form>
        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
