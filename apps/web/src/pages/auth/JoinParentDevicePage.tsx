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

const relations = ['爸爸', '媽媽', '阿公', '阿嬤', '叔叔', '阿姨', '其他'];

export function JoinParentDevicePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = decodeURIComponent(location.pathname.replace('/join-parent/', ''));
  const invite = useMemo(() => parseParentInviteToken(token), [token]);
  const existingBinding = readParentDeviceBinding();
  const [members, setMembers] = useState<ProductionFamilyParent[]>([]);
  const [parentName, setParentName] = useState('');
  const [relation, setRelation] = useState('爸爸');
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
        if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('邀請 QR 已過期，請請 Owner 重新產生。');
        await getProductionFamilyInvitePreview(invite.familyId, invite.inviteCode);
        const parents = await listProductionFamilyParents(invite.familyId);
        if (!cancelled) setMembers(parents);
      } catch (caught) {
        if (!cancelled) setMessage(caught instanceof Error ? caught.message : '邀請 QR 無效或已過期');
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
      const binding = await createDeviceBoundParent({
        familyId: invite.familyId,
        inviteCode: invite.inviteCode,
        parentName,
        relation,
        deviceLabel: currentDeviceLabel()
      });
      settingsRepository.updateSettings({
        family_name: invite.familyName,
        parent_name: binding.parentName,
        parent_email: ''
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
            <small>家長裝置已綁定</small>
            <h1>此裝置已加入 {invite?.familyName}</h1>
            <p>重新開啟 Safari、PWA 或加入主畫面後，會保持在同一個家庭。</p>
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
          <small>家長邀請</small>
          <h1>您即將加入：</h1>
          <p><strong>【{invite.familyName}】</strong></p>
        </header>

        <section className="auth-family-actions">
          <p>建立者：{invite.ownerName}（Owner）</p>
          <h2>目前家庭成員</h2>
          {members.length ? (
            <ul className="auth-member-list">
              {members.map((member) => (
                <li key={member.id}>{member.display_name}{member.parent_role === 'owner' ? '（Owner）' : ''}</li>
              ))}
            </ul>
          ) : (
            <p>{isValidating ? '正在讀取家庭成員...' : '尚未讀取到家庭成員'}</p>
          )}
        </section>

        <form onSubmit={submit}>
          <label>
            家長名稱
            <input
              required
              value={parentName}
              onChange={(event) => setParentName(event.target.value)}
              placeholder="爸爸"
            />
          </label>
          <label>
            與孩子關係
            <select value={relation} onChange={(event) => setRelation(event.target.value)}>
              {relations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="ds-primary-button" type="submit" disabled={isValidating || Boolean(message)}>
            加入家庭
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}
      </section>
    </main>
  );
}
