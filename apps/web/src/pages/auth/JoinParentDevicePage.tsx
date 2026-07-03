import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  createDeviceBoundParent,
  getProductionFamilyInvitePreview,
  listProductionFamilyParents,
  type ProductionFamilyParent
} from '../../lib/supabaseData';
import {
  currentDeviceLabel,
  parseParentInviteToken,
  readParentDeviceBinding
} from '../../lib/parentDeviceBinding';
import { settingsRepository } from '../../lib/settingsRepository';

const RELATIONS = ['爸爸', '媽媽', '爺爺', '奶奶', '舅舅', '其他'] as const;

export function JoinParentDevicePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = decodeURIComponent(location.pathname.replace('/join-parent/', ''));
  const invite = useMemo(() => parseParentInviteToken(token), [token]);
  const existingBinding = readParentDeviceBinding();
  const [members, setMembers] = useState<ProductionFamilyParent[]>([]);
  const [parentName, setParentName] = useState('');
  const [relation, setRelation] = useState<(typeof RELATIONS)[number]>('爸爸');
  const [customRelation, setCustomRelation] = useState('');
  const [message, setMessage] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const isAlreadyJoined = Boolean(existingBinding && invite && existingBinding.familyId === invite.familyId);

  useEffect(() => {
    let cancelled = false;
    async function loadInvite() {
      if (!invite) {
        setIsValidating(false);
        return;
      }
      try {
        if (new Date(invite.expiresAt).getTime() < Date.now()) {
          throw new Error('邀請 QR 已過期，請請 Owner 重新產生。');
        }
        await getProductionFamilyInvitePreview(invite.familyId, invite.inviteCode);
        const parents = await listProductionFamilyParents(invite.familyId);
        if (!cancelled) setMembers(parents);
      } catch (caught) {
        if (!cancelled) setMessage(caught instanceof Error ? caught.message : '邀請 QR 無法驗證');
      } finally {
        if (!cancelled) setIsValidating(false);
      }
    }
    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [invite]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    setMessage('');
    try {
      const nextRelation = relation === '其他' ? customRelation.trim() || '其他' : relation;
      const binding = await createDeviceBoundParent({
        familyId: invite.familyId,
        inviteCode: invite.inviteCode,
        parentName,
        relation: nextRelation,
        deviceLabel: currentDeviceLabel()
      });
      settingsRepository.updateSettings({
        family_name: invite.familyName,
        parent_name: binding.parentName
      });
      navigate('/parent', { replace: true });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '加入家庭失敗');
    }
  };

  if (isAlreadyJoined) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <header>
            <small>Dreamers Family V1.2</small>
            <h1>此裝置已加入 {invite?.familyName}</h1>
            <p>Safari、PWA 與加入主畫面都會直接進入自己的家庭首頁。</p>
          </header>
          <button className="ds-primary-button" type="button" onClick={() => navigate('/parent', { replace: true })}>
            進入家長首頁
          </button>
        </section>
      </main>
    );
  }

  if (!invite) return <Navigate to="/login" replace />;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <header>
          <small>Dreamers Family V1.2</small>
          <h1>掃 QR 加入家庭</h1>
          <p><strong>【{invite.familyName}】</strong></p>
          <p>Owner：{invite.ownerName}</p>
        </header>

        <section className="auth-family-actions">
          <h2>目前家長</h2>
          {members.length ? (
            <ul className="auth-member-list">
              {members.map((member) => (
                <li key={member.id}>
                  {member.display_name}
                  {member.parent_role === 'owner' ? '（Owner）' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>{isValidating ? '驗證邀請中...' : '尚未取得家長資料'}</p>
          )}
        </section>

        <form onSubmit={submit}>
          <label>
            家長稱呼
            <select value={relation} onChange={(event) => setRelation(event.target.value as (typeof RELATIONS)[number])}>
              {RELATIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {relation === '其他' ? (
            <label>
              其他稱呼
              <input
                required
                value={customRelation}
                onChange={(event) => setCustomRelation(event.target.value)}
                placeholder="請輸入稱呼"
              />
            </label>
          ) : null}
          <label>
            顯示名稱
            <input
              required
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
              placeholder="家長名稱"
            />
          </label>
          <button className="ds-primary-button" type="submit" disabled={isValidating}>
            建立 device binding
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
