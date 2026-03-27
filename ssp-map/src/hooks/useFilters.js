import { useState, useCallback } from 'react'

const CATEGORY_COLORS = {
  '사회복지시설': 'welfare',
  '국가기관': 'gov',
  '지방자치단체': 'local',
  '공공단체': 'public',
}

const ALL_REGIONS = [
  '서울', '인천', '경인', '경기북부', '부산.울산', '대구.경북',
  '광주.전남', '대전.충남', '충북', '전북', '경남', '강원영동',
  '강원영서', '제주',
]

const ALL_CATEGORIES = ['사회복지시설', '국가기관', '지방자치단체', '공공단체']

export function useFilters() {
  const [search, setSearch] = useState('')
  const [regions, setRegions] = useState([])
  const [categories, setCategories] = useState([])
  const [facilityType, setFacilityType] = useState('')
  const [sexRestriction, setSexRestriction] = useState(false)

  const toggleRegion = useCallback((r) =>
    setRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]), [])

  const toggleCategory = useCallback((c) =>
    setCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]), [])

  const reset = useCallback(() => {
    setSearch(''); setRegions([]); setCategories([])
    setFacilityType(''); setSexRestriction(false)
  }, [])

  const filterItems = useCallback((items) => {
    let result = items
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(d =>
        d.bokmuGgm?.toLowerCase().includes(q) ||
        d.drmJuso?.toLowerCase().includes(q)
      )
    }
    if (regions.length > 0)
      result = result.filter(d => regions.includes(d.gtcdNm))
    if (categories.length > 0)
      result = result.filter(d => categories.includes(d.ssggdaeBr))
    if (facilityType)
      result = result.filter(d => d.shbjsiseolGb === facilityType)
    if (sexRestriction)
      result = result.filter(d => d.sbjjehanYn === 'Y')
    return result
  }, [search, regions, categories, facilityType, sexRestriction])

  return {
    search, setSearch,
    regions, toggleRegion, ALL_REGIONS,
    categories, toggleCategory, ALL_CATEGORIES,
    facilityType, setFacilityType,
    sexRestriction, setSexRestriction,
    filterItems, reset,
    CATEGORY_COLORS,
  }
}
