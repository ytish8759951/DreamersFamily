import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLoggedInFamilyLandingPath } from '../../lib/familyLanding';
import { createProductionFamily } from '../../lib/supabaseData';
import { settingsRepository } from '../../lib/settingsRepository';
import { useLocalDataState } from '../../lib/useLocalData';

const DEFAULT_FAMILY_NAME = '小小夢想家 Family';
const PARENT_RELATION_OPTIONS = ['爸爸', '媽媽', '爺爺', '奶奶', '舅舅', '其他'] as const;

export function CreateFamilyPage() {
  const navigate = useNavigate();
  const state = useLocalDataState();
  const [familyName, setFamilyName] = useState('');
  const [parentRelation, setParentRelation] = useState<(typeof PARENT_RELATION_OPTIONS)[number]>('爸爸');
  const [customParentRelation, setCustomParentRelation] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);
    try {
      const nextFamilyName = familyName.trim() || DEFAULT_FAMILY_NAME;
      const nextParentRelation =
        parentRelation === '其他' ? customParentRelation.trim() || '其他' : parentRelation;

      await createProductionFamily(nextFamilyName);

      settingsRepository.updateSettings({
        family_name: nextFamilyName,
        parent_name: nextParentRelation
      });
      navigate(getLoggedInFamilyLandingPath(state), { replace: true });
    } catch (caught) {
      console.error('[CreateFamilyPage] create family failed', caught);
      setMessage(caught instanceof Error ? caught.message : '建立家庭失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <small>Dreamers Family V1.2</small>
          <h1>建立家庭</h1>
          <p>建立第一個家長的家庭與身分。</p>
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
            第一位家長稱呼
            <select value={parentRelation} onChange={(event) => setParentRelation(event.target.value as (typeof PARENT_RELATION_OPTIONS)[number])}>
              {PARENT_RELATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {parentRelation === '其他' ? (
            <label>
              其他稱呼
              <input
                required
                value={customParentRelation}
                onChange={(event) => setCustomParentRelation(event.target.value)}
                placeholder="請輸入稱呼"
              />
            </label>
          ) : null}

          <button className="ds-primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '建立中...' : '建立家庭'}
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
