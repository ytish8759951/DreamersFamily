import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { childrenRepository } from '../../lib/childrenRepository';
import { useLocalDataState } from '../../lib/useLocalData';

export function ChildTokenEntry() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const state = useLocalDataState();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('孩子專屬網址不正確。');
      return;
    }

    try {
      childrenRepository.bindChildDeviceByToken(token);
      navigate('/child/home', { replace: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '孩子專屬網址無法使用。';
      setError(
        message.includes('already bound')
          ? '這個孩子網址已綁定其他裝置，請家長先解除綁定或重新產生網址。'
          : '孩子專屬網址已失效，請家長重新產生網址。'
      );
    }
  }, [navigate, token]);

  if (state.device_child_id) return <Navigate to="/child/home" replace />;

  return (
    <div className="child-device-entry">
      <section>
        <span>夢</span>
        <h1>{error ? '無法開啟孩子首頁' : '正在開啟孩子首頁'}</h1>
        <p>{error || '請稍候，正在確認孩子專屬裝置。'}</p>
      </section>
    </div>
  );
}
