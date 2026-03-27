export default function Sidebar({
  totalCount, visibleCount,
  search, setSearch,
  regions, toggleRegion, ALL_REGIONS,
  categories, toggleCategory, ALL_CATEGORIES,
  facilityType, setFacilityType, facilityTypes,
  sexRestriction, setSexRestriction,
  reset,
  CATEGORY_COLORS,
}) {
  const REPORT_EMAIL = 'daniel0406070@gmail.com'

  const handleReportClick = () => {
    const subject = '[사회복무요원 복무기관 지도] 오류 제보'
    const selectedRegions = regions.length === ALL_REGIONS.length ? '전체' : regions.join(', ')
    const selectedCategories = categories.length === ALL_CATEGORIES.length ? '전체' : categories.join(', ')
    const selectedFacilityType = facilityType || '전체'
    const selectedSexRestriction = sexRestriction ? '성범죄제한 기관만 보기: ON' : '성범죄제한 기관만 보기: OFF'
    const body = [
      '오류 내용을 아래 양식에 맞춰 작성해주세요.',
      '',
      '1) 오류 설명:',
      '2) 재현 방법:',
      '3) 기대 결과:',
      '4) 실제 결과:',
      '',
      '[자동 첨부 정보]',
      `- 페이지 URL: ${window.location.href}`,
      `- 검색어: ${search || '(없음)'}`,
      `- 기관 대분류: ${selectedCategories}`,
      `- 관할지방청: ${selectedRegions}`,
      `- 시설 구분: ${selectedFacilityType}`,
      `- ${selectedSexRestriction}`,
      `- 현재 표시 기관: ${visibleCount.toLocaleString()}개 / 전체 ${totalCount.toLocaleString()}개`,
    ].join('\n')
    const mailtoUrl = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailtoUrl
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>
          <span className="icon">🗺</span>
          사회복무요원 복무기관
        </h1>
        <p>전국 복무기관 현황을 지도에서 확인하세요</p>
        <div className="stats-row">
          <div className="stat-badge">
            <span className="num">{totalCount.toLocaleString()}</span>
            <span className="label">전체 기관</span>
          </div>
          <div className="stat-badge">
            <span className="num">{visibleCount.toLocaleString()}</span>
            <span className="label">현재 표시</span>
          </div>
        </div>
      </div>

      <div className="sidebar-body">
        <div className="search-box">
          <input
            type="text"
            placeholder="기관명 또는 주소 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="search-icon">🔍</span>
        </div>

        <div className="filter-section">
          <h3>기관 대분류</h3>
          <div className="filter-chips">
            {ALL_CATEGORIES.map(c => (
              <button
                key={c}
                className={`chip ${CATEGORY_COLORS[c] || ''} ${categories.includes(c) ? 'active' : ''}`}
                onClick={() => toggleCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <h3>관할지방청</h3>
          <div className="filter-chips">
            {ALL_REGIONS.map(r => (
              <button
                key={r}
                className={`chip ${regions.includes(r) ? 'active' : ''}`}
                onClick={() => toggleRegion(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {facilityTypes.length > 0 && (
          <div className="filter-section">
            <h3>시설 구분</h3>
            <select
              className="filter-select"
              value={facilityType}
              onChange={e => setFacilityType(e.target.value)}
            >
              <option value="">전체</option>
              {facilityTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div className="toggle-row">
          <span className="toggle-label">성범죄제한 기관만 보기</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={sexRestriction}
              onChange={e => setSexRestriction(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <button className="reset-btn" onClick={reset}>↺ 필터 초기화</button>
        <button type="button" className="report-btn" onClick={handleReportClick}>
          ⚠ 오류 제보하기
        </button>
      </div>
    </aside>
  )
}
