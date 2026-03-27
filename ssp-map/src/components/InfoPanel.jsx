const TYPE_BADGE = {
  '사회복지시설': { cls: 'welfare', label: '사회복지' },
  '국가기관':    { cls: 'gov',     label: '국가기관' },
  '지방자치단체': { cls: 'local',   label: '지자체' },
  '공공단체':    { cls: 'public',  label: '공공단체' },
}

const BADGE_COLORS = {
  welfare: { bg: 'rgba(79,123,255,0.2)', color: '#4f7bff' },
  gov:     { bg: 'rgba(255,123,79,0.2)', color: '#ff7b4f' },
  local:   { bg: 'rgba(79,195,247,0.2)', color: '#4fc3f7' },
  public:  { bg: 'rgba(167,139,250,0.2)', color: '#a78bfa' },
}

export default function InfoPanel({ item, onClose }) {
  if (!item) return null

  const badge = TYPE_BADGE[item.ssggdaeBr] || { cls: 'public', label: item.ssggdaeBr }
  const badgeStyle = BADGE_COLORS[badge.cls] || BADGE_COLORS.public
  const diseases = item.sbjhjilbyeong?.split('/').filter(Boolean) || []

  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{item.bokmuGgm}</h2>
          {item.dpBokmuGgm && item.dpBokmuGgm !== item.bokmuGgm && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
              상위: {item.dpBokmuGgm}
            </div>
          )}
        </div>
        <span
          className={`type-badge`}
          style={{ background: badgeStyle.bg, color: badgeStyle.color }}
        >
          {badge.label}
        </span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="info-panel-body">
        {item.drmJuso && (
          <div className="info-row">
            <span className="info-icon">📍</span>
            <span className="info-value">{item.drmJuso}</span>
          </div>
        )}

        {item.jeonhwaNo && (
          <div className="info-row">
            <span className="info-icon">📞</span>
            <a
              href={`tel:${item.jeonhwaNo}`}
              style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}
            >
              {item.jeonhwaNo}
            </a>
          </div>
        )}

        {item.gtcdNm && (
          <div className="info-row">
            <span className="info-icon">🏢</span>
            <span className="info-text">관할지방청</span>
            <span className="info-value" style={{ marginLeft: 6 }}>{item.gtcdNm}</span>
          </div>
        )}

        {item.shbjsiseolGb && (
          <div className="info-row">
            <span className="info-icon">🏷</span>
            <span className="info-text">시설구분</span>
            <span className="info-value" style={{ marginLeft: 6 }}>{item.shbjsiseolGb}</span>
          </div>
        )}

        <div className="info-tags">
          <span className={`info-tag ${item.sbjjehanYn === 'Y' ? 'sex-no' : 'sex-ok'}`}>
            {item.sbjjehanYn === 'Y' ? '⚠ 성범죄 제한' : '✓ 성범죄 제한 없음'}
          </span>
          {diseases.map((d, i) => (
            <span key={i} className="info-tag restriction">{d}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
