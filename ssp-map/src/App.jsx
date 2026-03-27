import { useState, useEffect, useMemo } from 'react'
import Map from './components/Map'
import Sidebar from './components/Sidebar'
import InfoPanel from './components/InfoPanel'
import { useFilters } from './hooks/useFilters'
import { withBase } from './utils/url'

export default function App() {
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)

  const {
    search, setSearch,
    regions, toggleRegion, ALL_REGIONS,
    categories, toggleCategory, ALL_CATEGORIES,
    facilityType, setFacilityType,
    sexRestriction, setSexRestriction,
    filterItems, reset,
    CATEGORY_COLORS,
  } = useFilters()

  useEffect(() => {
    fetch(withBase('bmgg_with_coords.json'))
      .then(r => r.json())
      .then(data => {
        setAllData(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const facilityTypes = useMemo(() => {
    const types = [...new Set(allData.map(d => d.shbjsiseolGb).filter(Boolean))].sort()
    return types
  }, [allData])

  const filtered = useMemo(() => filterItems(allData), [filterItems, allData])
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (search.trim()) count += 1
    count += regions.length
    count += categories.length
    if (facilityType) count += 1
    if (sexRestriction) count += 1
    return count
  }, [search, regions, categories, facilityType, sexRestriction])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 960px)')
    const handleChange = (event) => {
      if (!event.matches) setIsMobileFilterOpen(false)
    }

    handleChange(mediaQuery)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
        <p>복무기관 데이터를 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        mobileOpen={isMobileFilterOpen}
        onCloseMobile={() => setIsMobileFilterOpen(false)}
        totalCount={allData.length}
        visibleCount={filtered.length}
        search={search} setSearch={setSearch}
        regions={regions} toggleRegion={toggleRegion} ALL_REGIONS={ALL_REGIONS}
        categories={categories} toggleCategory={toggleCategory} ALL_CATEGORIES={ALL_CATEGORIES}
        facilityType={facilityType} setFacilityType={setFacilityType} facilityTypes={facilityTypes}
        sexRestriction={sexRestriction} setSexRestriction={setSexRestriction}
        reset={reset}
        CATEGORY_COLORS={CATEGORY_COLORS}
      />

      <div className="map-wrap">
        <div className="mobile-map-controls">
          <button
            type="button"
            className="mobile-filter-toggle"
            onClick={() => setIsMobileFilterOpen(prev => !prev)}
          >
            {isMobileFilterOpen ? '필터 닫기' : '필터 열기'}
            {activeFilterCount > 0 && <span className="mobile-filter-count">{activeFilterCount}</span>}
          </button>
        </div>

        <Map
          items={filtered}
          allItems={allData}
          regions={regions}
          categories={categories}
          search={search}
          facilityType={facilityType}
          sexRestriction={sexRestriction}
          onSelect={setSelected}
        />

        <div className="map-overlay-info">
          <strong>{filtered.length.toLocaleString()}</strong>개 기관 표시 중
          {filtered.length !== allData.length && (
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              (전체 {allData.length.toLocaleString()}개)
            </span>
          )}
        </div>

        <InfoPanel item={selected} onClose={() => setSelected(null)} />
      </div>

      <button
        type="button"
        className={`sidebar-backdrop ${isMobileFilterOpen ? 'visible' : ''}`}
        onClick={() => setIsMobileFilterOpen(false)}
        aria-label="필터 패널 닫기"
      />
    </div>
  )
}
