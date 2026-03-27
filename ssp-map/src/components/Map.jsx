import { useEffect, useRef, useCallback, useState } from 'react'
import { getMarkerColor, createMarkerImage } from '../utils/markerUtils'
import { withBase } from '../utils/url'

const MIN_KAKAO_LEVEL = 1
const MAX_KAKAO_LEVEL = 14

function getItemKey(item, idx) {
  if (item.rnum) return `rnum:${item.rnum}`
  if (item.bmgigwanCd) return `bmgigwanCd:${item.bmgigwanCd}`
  return `${item.bokmuGgm ?? ''}|${item.drmJuso ?? ''}|${item.lat}|${item.lng}|idx:${idx}`
}

function getClusterSizeClass(count) {
  if (count >= 100) return 'lg'
  if (count >= 30) return 'md'
  return 'sm'
}

function clampKakaoLevel(level) {
  return Math.max(MIN_KAKAO_LEVEL, Math.min(MAX_KAKAO_LEVEL, Math.round(level)))
}

function makeCategorySetKey(categories) {
  return [...new Set(categories)].sort().join('||')
}

function resolveBucketIds(meta, regions, categories) {
  if (!regions.length && !categories.length) return [meta.allBucketId]

  if (regions.length && !categories.length) {
    return [...new Set(
      regions
        .map(region => meta.regionBucketIds[region])
        .filter(Boolean),
    )]
  }

  const categorySetKey = makeCategorySetKey(categories)
  if (!regions.length && categories.length && meta.categorySetBucketIds) {
    const id = meta.categorySetBucketIds[categorySetKey]
    if (id) return [id]
  }

  if (regions.length && categories.length && meta.regionCategorySetBucketIds) {
    const ids = regions
      .map(region => meta.regionCategorySetBucketIds[`${region}||${categorySetKey}`])
      .filter(Boolean)
    if (ids.length) return [...new Set(ids)]
  }

  if (!regions.length && categories.length) {
    return [...new Set(
      categories
        .map(category => meta.categoryBucketIds[category])
        .filter(Boolean),
    )]
  }

  const ids = []
  for (const region of regions) {
    for (const category of categories) {
      const id = meta.regionCategoryBucketIds[`${region}||${category}`]
      if (id) ids.push(id)
    }
  }
  return [...new Set(ids)]
}

function matchRegionCategory(item, regions, categories) {
  if (regions.length && !regions.includes(item.gtcdNm)) return false
  if (categories.length && !categories.includes(item.ssggdaeBr)) return false
  return true
}

export default function Map({
  items,
  allItems,
  regions,
  categories,
  search,
  facilityType,
  sexRestriction,
  onSelect,
}) {
  const mapRef = useRef(null)
  const clustererRef = useRef(null)
  const fallbackMarkersRef = useRef([])
  const pointMarkersRef = useRef([])
  const clusterOverlaysRef = useRef([])
  const markerImageCacheRef = useRef(new globalThis.Map())
  const itemByKeyRef = useRef(new globalThis.Map())
  const syncRafRef = useRef(null)
  const syncTokenRef = useRef(0)
  const metaRef = useRef(null)
  const metaPromiseRef = useRef(null)
  const dataCacheRef = useRef(new globalThis.Map())
  const dataPromiseRef = useRef(new globalThis.Map())
  const [ready, setReady] = useState(false)

  const usePrecomputed = !search.trim() && !facilityType

  useEffect(() => {
    const itemByKey = new globalThis.Map()
    let validIdx = 0
    allItems.forEach((item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return
      itemByKey.set(getItemKey(item, validIdx), item)
      validIdx += 1
    })
    itemByKeyRef.current = itemByKey
  }, [allItems])

  const clearFallbackMarkers = useCallback(() => {
    if (clustererRef.current) clustererRef.current.clear()
    fallbackMarkersRef.current.forEach(marker => marker.setMap(null))
    fallbackMarkersRef.current = []
  }, [])

  const clearPrecomputedLayers = useCallback(() => {
    pointMarkersRef.current.forEach(marker => marker.setMap(null))
    pointMarkersRef.current = []
    clusterOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    clusterOverlaysRef.current = []
  }, [])

  useEffect(() => {
    let intervalId = null
    let destroyed = false

    const cleanup = () => {
      syncTokenRef.current += 1
      if (syncRafRef.current) {
        cancelAnimationFrame(syncRafRef.current)
        syncRafRef.current = null
      }
      clearFallbackMarkers()
      clearPrecomputedLayers()
      if (clustererRef.current) {
        clustererRef.current.clear()
        clustererRef.current = null
      }
      markerImageCacheRef.current.clear()
      mapRef.current = null
    }

    const init = () => {
      window.kakao.maps.load(() => {
        if (destroyed) return

        const map = new window.kakao.maps.Map(document.getElementById('kakaomap'), {
          center: new window.kakao.maps.LatLng(36.2683, 127.6358),
          level: 12,
          tileAnimation: false,
        })

        const clusterer = new window.kakao.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 10,
          styles: [
            {
              width: '48px', height: '48px',
              background: 'rgba(79,123,255,0.85)',
              borderRadius: '50%',
              color: '#fff',
              textAlign: 'center',
              lineHeight: '48px',
              fontSize: '14px',
              fontWeight: '700',
              border: '2px solid rgba(255,255,255,0.4)',
            },
            {
              width: '56px', height: '56px',
              background: 'rgba(79,123,255,0.9)',
              borderRadius: '50%',
              color: '#fff',
              textAlign: 'center',
              lineHeight: '56px',
              fontSize: '15px',
              fontWeight: '700',
              border: '2px solid rgba(255,255,255,0.5)',
            },
            {
              width: '64px', height: '64px',
              background: 'rgba(255,123,79,0.9)',
              borderRadius: '50%',
              color: '#fff',
              textAlign: 'center',
              lineHeight: '64px',
              fontSize: '16px',
              fontWeight: '700',
              border: '2px solid rgba(255,255,255,0.5)',
            },
          ],
        })

        clustererRef.current = clusterer
        mapRef.current = map
        setReady(true)
      })
    }

    if (window.kakao && window.kakao.maps) {
      init()
    } else {
      intervalId = setInterval(() => {
        if (window.kakao && window.kakao.maps) {
          clearInterval(intervalId)
          init()
        }
      }, 100)
    }

    return () => {
      destroyed = true
      if (intervalId) clearInterval(intervalId)
      cleanup()
    }
  }, [clearFallbackMarkers, clearPrecomputedLayers])

  const loadMeta = useCallback(async () => {
    if (metaRef.current) return metaRef.current
    if (metaPromiseRef.current) return metaPromiseRef.current

    metaPromiseRef.current = fetch(withBase('preclusters/meta.json'))
      .then((res) => {
        if (!res.ok) throw new Error('failed to load precluster meta')
        return res.json()
      })
      .then((meta) => {
        metaRef.current = meta
        return meta
      })
      .finally(() => {
        metaPromiseRef.current = null
      })

    return metaPromiseRef.current
  }, [])

  const loadBucketLevelData = useCallback(async (bucketId, level) => {
    const cacheKey = `${bucketId}:${level}`
    if (dataCacheRef.current.has(cacheKey)) return dataCacheRef.current.get(cacheKey)
    if (dataPromiseRef.current.has(cacheKey)) return dataPromiseRef.current.get(cacheKey)

    const promise = fetch(withBase(`preclusters/${bucketId}/l${level}.json`))
      .then((res) => {
        if (!res.ok) throw new Error(`failed to load precluster data: ${cacheKey}`)
        return res.json()
      })
      .then((payload) => {
        dataCacheRef.current.set(cacheKey, payload)
        return payload
      })
      .finally(() => {
        dataPromiseRef.current.delete(cacheKey)
      })

    dataPromiseRef.current.set(cacheKey, promise)
    return promise
  }, [])

  const getOrCreateMarkerImageByCategory = useCallback((category) => {
    const color = getMarkerColor(category)
    let image = markerImageCacheRef.current.get(color)
    if (!image) {
      image = createMarkerImage(color)
      markerImageCacheRef.current.set(color, image)
    }
    return image
  }, [])

  const renderPrecomputedEntries = useCallback((entries) => {
    const map = mapRef.current
    if (!map) return

    clearPrecomputedLayers()

    for (const entry of entries) {
      if (entry.t === 'p') {
        const marker = new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(entry.lat, entry.lng),
          image: getOrCreateMarkerImageByCategory(entry.c),
        })

        window.kakao.maps.event.addListener(marker, 'click', () => {
          const item = itemByKeyRef.current.get(entry.k)
          if (item) onSelect(item)
        })

        marker.setMap(map)
        pointMarkersRef.current.push(marker)
        continue
      }

      const position = new window.kakao.maps.LatLng(entry.lat, entry.lng)
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `server-cluster server-cluster-${getClusterSizeClass(entry.n)}`
      el.textContent = entry.n.toLocaleString()
      el.addEventListener('click', () => {
        const nextLevel = Math.max(MIN_KAKAO_LEVEL, map.getLevel() - 1)
        map.setLevel(nextLevel, { anchor: position })
      })

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 0.5,
      })
      overlay.setMap(map)
      clusterOverlaysRef.current.push(overlay)
    }
  }, [clearPrecomputedLayers, getOrCreateMarkerImageByCategory, onSelect])

  const renderRawPointsInBounds = useCallback((map, bounds) => {
    clearPrecomputedLayers()

    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    const minLat = sw.getLat()
    const maxLat = ne.getLat()
    const minLng = sw.getLng()
    const maxLng = ne.getLng()

    const markers = allItems
      .filter(item =>
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng) &&
        item.lat >= minLat &&
        item.lat <= maxLat &&
        item.lng >= minLng &&
        item.lng <= maxLng &&
        matchRegionCategory(item, regions, categories),
      )
      .map((item) => {
        const marker = new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(item.lat, item.lng),
          image: getOrCreateMarkerImageByCategory(item.ssggdaeBr),
          title: item.bokmuGgm,
        })
        window.kakao.maps.event.addListener(marker, 'click', () => onSelect(item))
        marker.setMap(map)
        return marker
      })

    pointMarkersRef.current = markers
  }, [
    allItems,
    regions,
    categories,
    clearPrecomputedLayers,
    getOrCreateMarkerImageByCategory,
    onSelect,
  ])

  const syncUsingPrecomputed = useCallback(async () => {
    if (!ready || !mapRef.current) return

    const map = mapRef.current
    const token = ++syncTokenRef.current

    let meta
    try {
      meta = await loadMeta()
    } catch {
      return
    }
    if (token !== syncTokenRef.current) return
    const activeMeta = sexRestriction ? meta.sexRestricted : meta
    if (!activeMeta) return

    const level = clampKakaoLevel(map.getLevel())
    const bounds = map.getBounds()

    if (level <= 2) {
      renderRawPointsInBounds(map, bounds)
      return
    }

    const bucketIds = resolveBucketIds(activeMeta, regions, categories)
    if (!bucketIds.length) {
      clearPrecomputedLayers()
      return
    }

    let payloads
    try {
      payloads = await Promise.all(
        bucketIds.map(bucketId => loadBucketLevelData(bucketId, level)),
      )
    } catch {
      return
    }
    if (token !== syncTokenRef.current) return

    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    const minLat = sw.getLat()
    const maxLat = ne.getLat()
    const minLng = sw.getLng()
    const maxLng = ne.getLng()

    const seenPointKeys = new Set()
    const seenClusterKeys = new Set()
    const filteredEntries = []

    for (const payload of payloads) {
      for (const entry of payload) {
        if (
          entry.lat < minLat || entry.lat > maxLat ||
          entry.lng < minLng || entry.lng > maxLng
        ) {
          continue
        }

        if (entry.t === 'p') {
          if (seenPointKeys.has(entry.k)) continue
          seenPointKeys.add(entry.k)
          filteredEntries.push(entry)
          continue
        }

        const clusterKey = `${entry.lat}:${entry.lng}:${entry.n}`
        if (seenClusterKeys.has(clusterKey)) continue
        seenClusterKeys.add(clusterKey)
        filteredEntries.push(entry)
      }
    }

    if (token !== syncTokenRef.current) return
    renderPrecomputedEntries(filteredEntries)
  }, [
    ready,
    regions,
    categories,
    sexRestriction,
    loadMeta,
    loadBucketLevelData,
    clearPrecomputedLayers,
    renderRawPointsInBounds,
    renderPrecomputedEntries,
  ])

  const syncUsingClientCluster = useCallback(() => {
    if (!ready || !clustererRef.current) return
    clearPrecomputedLayers()

    const clusterer = clustererRef.current
    clusterer.clear()
    fallbackMarkersRef.current.forEach(marker => marker.setMap(null))

    const markers = items
      .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .map((item) => {
        const marker = new window.kakao.maps.Marker({
          position: new window.kakao.maps.LatLng(item.lat, item.lng),
          image: getOrCreateMarkerImageByCategory(item.ssggdaeBr),
          title: item.bokmuGgm,
        })
        window.kakao.maps.event.addListener(marker, 'click', () => onSelect(item))
        return marker
      })

    fallbackMarkersRef.current = markers
    clusterer.addMarkers(markers)
  }, [ready, items, clearPrecomputedLayers, getOrCreateMarkerImageByCategory, onSelect])

  const scheduleSync = useCallback(({ force = false } = {}) => {
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
    syncRafRef.current = requestAnimationFrame(() => {
      syncRafRef.current = null
      if (usePrecomputed) {
        clearFallbackMarkers()
        syncUsingPrecomputed()
      } else {
        // Client-side cluster mode does not depend on viewport.
        // Avoid rebuilding all markers on every map idle event.
        if (!force) return
        syncTokenRef.current += 1
        syncUsingClientCluster()
      }
    })
  }, [usePrecomputed, clearFallbackMarkers, syncUsingPrecomputed, syncUsingClientCluster])

  useEffect(() => {
    if (!ready || !mapRef.current) return undefined

    const map = mapRef.current
    const onIdle = () => scheduleSync()
    window.kakao.maps.event.addListener(map, 'idle', onIdle)
    scheduleSync({ force: true })

    return () => {
      window.kakao.maps.event.removeListener(map, 'idle', onIdle)
    }
  }, [ready, scheduleSync])

  useEffect(() => {
    if (!ready) return
    scheduleSync({ force: true })
  }, [
    ready,
    scheduleSync,
    items,
    regions,
    categories,
    search,
    facilityType,
    sexRestriction,
  ])

  return <div id="kakaomap" style={{ width: '100%', height: '100%' }} />
}
