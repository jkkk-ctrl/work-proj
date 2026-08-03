import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';

const REGION_COLORS = {
  capital_region:     '#1E3D7B',
  gangwon_region:     '#7D8DC8',
  chungcheong_region: '#94C4E0',
  honam_region:       '#4A8EC0',
  yeongnam_region:    '#132B58',
  jeju_region:        '#B8D4EC',
};

const REGION_ORDER = [
  'capital_region',
  'gangwon_region',
  'chungcheong_region',
  'honam_region',
  'yeongnam_region',
  'jeju_region',
];

function autoLabel() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 기준`;
}

function formatLastModified(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 `
    + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 저장됨`;
}

export default function AdminPage() {
  const ADMIN_PASSWORD = 'plktest'; // 여기 원하는 걸로 바꾸세요
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [label, setLabel] = useState(autoLabel());
  const [editingLabel, setEditingLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef(null);
  const labelInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/regions')
      .then(r => r.json())
      .then(d => {
        setData(d);
        // Default to today's auto-label; if a saved label exists keep it
        setLabel(d.updated_label || autoLabel());
        const v = {};
        Object.entries(d.regions || {}).forEach(([id, r]) => { v[id] = r.value; });
        setValues(v);
      });
  }, []);

  function startEditLabel() {
    setEditingLabel(true);
    // Focus after render
    setTimeout(() => labelInputRef.current?.focus(), 0);
  }

  function commitLabel() {
    setEditingLabel(false);
    if (!label.trim()) setLabel(autoLabel());
  }

  async function handleSave() {
    setSaving(true);
    try {
      const regions = {};
      REGION_ORDER.forEach(id => { regions[id] = { value: Number(values[id] ?? 0) }; });

      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regions, updated_label: label }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`저장 실패: ${body.error || '서버 오류'}`);
        return;
      }

      const refreshed = await fetch('/api/regions').then(r => r.json());
      setData(refreshed);

      clearTimeout(toastTimer.current);
      setToast(true);
      toastTimer.current = setTimeout(() => setToast(false), 2500);
    } catch {
      alert('저장 실패: 네트워크 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const regions = data?.regions || {};

  if (!authed) {
    return (
      <div style={{ maxWidth: 320, margin: '100px auto', textAlign: 'center' }}>
        <p>관리자 비밀번호를 입력하세요</p>
        <input
          type="password"
          value={pwInput}
          onChange={e => setPwInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && pwInput === ADMIN_PASSWORD) setAuthed(true);
          }}
          style={{ padding: 8, fontSize: 16 }}
        />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>어드민 — 제휴 골프장 관리</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="admin-page">
        <h1>제휴 골프장 관리</h1>
        <p className="admin-desc">
          권역별 골프장 수와 업데이트 일자를 수정하고 저장하면 공개 페이지에 즉시 반영됩니다.
        </p>

        {/* ① 권역별 골프장 수 */}
        <div className="admin-card">
          <h2>권역별 골프장 수</h2>
          <table className="region-table">
            <thead>
              <tr>
                <th>권역</th>
                <th style={{ textAlign: 'right' }}>골프장 수</th>
              </tr>
            </thead>
            <tbody>
              {REGION_ORDER.map(id => {
                const r = regions[id];
                if (!r) return null;
                return (
                  <tr key={id}>
                    <td className="region-name-cell">
                      <span className="region-dot" style={{ background: REGION_COLORS[id] }} />
                      {r.name}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        value={values[id] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ② 업데이트 일자 */}
        <div className="admin-card">
          <div className="card-title-row">
            <h2>업데이트 일자</h2>
            {data?.last_modified && (
              <div className="date-last-modified">
                {formatLastModified(data.last_modified)}
              </div>
            )}
          </div>

          <div className="date-control">
            {editingLabel ? (
              <input
                ref={labelInputRef}
                className="date-inline-input"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={e => { if (e.key === 'Enter') commitLabel(); }}
                placeholder="예: 2026년 7월 기준"
              />
            ) : (
              <button className="date-inline-text" onClick={startEditLabel}>
                {label}
                <span className="edit-hint">편집</span>
              </button>
            )}
          </div>
        </div>

        <button className="save-btn" onClick={handleSave} disabled={saving || !data}>
          {saving ? '저장 중…' : '저장하기'}
        </button>

        <a href="/" className="admin-link">← 공개 페이지로 돌아가기</a>
      </div>

      <div className={`toast${toast ? ' show' : ''}`}>저장되었습니다 ✓</div>
    </>
  );
}
