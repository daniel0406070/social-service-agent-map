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
    </div>
  )
}
