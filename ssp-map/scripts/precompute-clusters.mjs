import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Supercluster from 'supercluster'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const inputPath = path.join(projectRoot, 'public', 'bmgg_with_coords.json')
const outputRoot = path.join(projectRoot, 'public', 'preclusters')

const KAKAO_LEVELS = Array.from({ length: 14 }, (_, i) => i + 1)
const SUPER_MAX_ZOOM = 16
const CLUSTER_RADIUS = 16

function getItemKey(item, idx) {
  if (item.rnum) return `rnum:${item.rnum}`
  if (item.bmgigwanCd) return `bmgigwanCd:${item.bmgigwanCd}`
  return `${item.bokmuGgm ?? ''}|${item.drmJuso ?? ''}|${item.lat}|${item.lng}|idx:${idx}`
}

function kakaoLevelToSuperZoom(level) {
  // Slightly loosen clustering by using a bit more detailed zoom per Kakao level.
  return Math.max(0, Math.min(SUPER_MAX_ZOOM, SUPER_MAX_ZOOM - level + 1))
}

function toFeature(item, idx) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [item.lng, item.lat],
    },
    properties: {
      key: getItemKey(item, idx),
      category: item.ssggdaeBr ?? '',
    },
  }
}

function inKoreaBoundsBBox(items) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const item of items) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue
    if (item.lat < minLat) minLat = item.lat
    if (item.lat > maxLat) maxLat = item.lat
    if (item.lng < minLng) minLng = item.lng
    if (item.lng > maxLng) maxLng = item.lng
  }

  const margin = 0.15
  return [minLng - margin, minLat - margin, maxLng + margin, maxLat + margin]
}

function normalizeItems(items) {
  return items
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .map((item, idx) => ({ ...item, __idx: idx }))
}

function makeCategorySetKey(categories) {
  return [...new Set(categories)].sort().join('||')
}

function buildBuckets(items, { idPrefix = '' } = {}) {
  const regions = [...new Set(items.map(item => item.gtcdNm).filter(Boolean))].sort()
  const categories = [...new Set(items.map(item => item.ssggdaeBr).filter(Boolean))].sort()

  const buckets = []
  const regionBucketIds = {}
  const categoryBucketIds = {}
  const regionCategoryBucketIds = {}
  const categorySetBucketIds = {}
  const regionCategorySetBucketIds = {}
  const allBucketId = `${idPrefix}all`

  buckets.push({
    id: allBucketId,
    items,
  })

  regions.forEach((region, idx) => {
    const id = `${idPrefix}r_${idx}`
    regionBucketIds[region] = id
    buckets.push({
      id,
      items: items.filter(item => item.gtcdNm === region),
    })
  })

  categories.forEach((category, idx) => {
    const id = `${idPrefix}c_${idx}`
    categoryBucketIds[category] = id
    buckets.push({
      id,
      items: items.filter(item => item.ssggdaeBr === category),
    })
  })

  const categoryMasks = Array.from({ length: (1 << categories.length) - 1 }, (_, idx) => idx + 1)
  categoryMasks.forEach((mask) => {
    const selectedCategories = categories.filter((_, bitIdx) => mask & (1 << bitIdx))
    const setKey = makeCategorySetKey(selectedCategories)
    if (selectedCategories.length === 1) {
      const singleCategory = selectedCategories[0]
      const existingId = categoryBucketIds[singleCategory]
      if (existingId) categorySetBucketIds[setKey] = existingId
      return
    }
    const filtered = items.filter(item => selectedCategories.includes(item.ssggdaeBr))
    if (!filtered.length) return
    const id = `${idPrefix}cs_${mask}`
    categorySetBucketIds[setKey] = id
    buckets.push({ id, items: filtered })
  })

  regions.forEach((region, rIdx) => {
    categories.forEach((category, cIdx) => {
      const filtered = items.filter(
        item => item.gtcdNm === region && item.ssggdaeBr === category,
      )
      if (!filtered.length) return
      const id = `${idPrefix}rc_${rIdx}_${cIdx}`
      regionCategoryBucketIds[`${region}||${category}`] = id
      buckets.push({ id, items: filtered })
    })
  })

  regions.forEach((region, rIdx) => {
    categoryMasks.forEach((mask) => {
      const selectedCategories = categories.filter((_, bitIdx) => mask & (1 << bitIdx))
      const setKey = makeCategorySetKey(selectedCategories)
      if (selectedCategories.length === 1) {
        const singleCategory = selectedCategories[0]
        const existingId = regionCategoryBucketIds[`${region}||${singleCategory}`]
        if (existingId) regionCategorySetBucketIds[`${region}||${setKey}`] = existingId
        return
      }
      const filtered = items.filter(
        item => item.gtcdNm === region && selectedCategories.includes(item.ssggdaeBr),
      )
      if (!filtered.length) return
      const id = `${idPrefix}rcs_${rIdx}_${mask}`
      regionCategorySetBucketIds[`${region}||${setKey}`] = id
      buckets.push({ id, items: filtered })
    })
  })

  return {
    allBucketId,
    buckets,
    regions,
    categories,
    regionBucketIds,
    categoryBucketIds,
    regionCategoryBucketIds,
    categorySetBucketIds,
    regionCategorySetBucketIds,
  }
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true })
  await fs.mkdir(dirPath, { recursive: true })
}

async function writeBucketClusters(bucket, bbox) {
  const bucketDir = path.join(outputRoot, bucket.id)
  await fs.mkdir(bucketDir, { recursive: true })

  const features = bucket.items.map(item => toFeature(item, item.__idx))
  const index = new Supercluster({
    maxZoom: SUPER_MAX_ZOOM,
    radius: CLUSTER_RADIUS,
    minPoints: 2,
  })
  index.load(features)

  for (const level of KAKAO_LEVELS) {
    const zoom = kakaoLevelToSuperZoom(level)
    const clusters = index.getClusters(bbox, zoom)
    const payload = clusters.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates
      if (feature.properties.cluster) {
        return {
          t: 'c',
          lat,
          lng,
          n: feature.properties.point_count,
        }
      }
      return {
        t: 'p',
        lat,
        lng,
        k: feature.properties.key,
        c: feature.properties.category,
      }
    })
    await fs.writeFile(
      path.join(bucketDir, `l${level}.json`),
      JSON.stringify(payload),
      'utf8',
    )
  }
}

async function main() {
  const raw = JSON.parse(await fs.readFile(inputPath, 'utf8'))
  const items = normalizeItems(raw)
  const bbox = inKoreaBoundsBBox(items)
  const sexRestrictedItems = items.filter(item => item.sbjjehanYn === 'Y')

  const allScope = buildBuckets(items)
  const sexRestrictedScope = buildBuckets(sexRestrictedItems, { idPrefix: 's_' })

  const {
    allBucketId,
    buckets,
    regions,
    categories,
    regionBucketIds,
    categoryBucketIds,
    regionCategoryBucketIds,
    categorySetBucketIds,
    regionCategorySetBucketIds,
  } = allScope

  await ensureCleanDir(outputRoot)

  for (const bucket of [...buckets, ...sexRestrictedScope.buckets]) {
    await writeBucketClusters(bucket, bbox)
  }

  const meta = {
    version: 3,
    generatedAt: new Date().toISOString(),
    kakaoLevels: KAKAO_LEVELS,
    allBucketId,
    regions,
    categories,
    regionBucketIds,
    categoryBucketIds,
    regionCategoryBucketIds,
    categorySetBucketIds,
    regionCategorySetBucketIds,
    sexRestricted: {
      allBucketId: sexRestrictedScope.allBucketId,
      regions: sexRestrictedScope.regions,
      categories: sexRestrictedScope.categories,
      regionBucketIds: sexRestrictedScope.regionBucketIds,
      categoryBucketIds: sexRestrictedScope.categoryBucketIds,
      regionCategoryBucketIds: sexRestrictedScope.regionCategoryBucketIds,
      categorySetBucketIds: sexRestrictedScope.categorySetBucketIds,
      regionCategorySetBucketIds: sexRestrictedScope.regionCategorySetBucketIds,
    },
  }

  await fs.writeFile(
    path.join(outputRoot, 'meta.json'),
    JSON.stringify(meta),
    'utf8',
  )

  const totalBuckets = buckets.length + sexRestrictedScope.buckets.length
  console.log(
    `Generated ${totalBuckets} buckets x ${KAKAO_LEVELS.length} levels to /public/preclusters`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
