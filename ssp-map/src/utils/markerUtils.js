const TYPE_COLORS = {
  '사회복지시설': '#4f7bff',
  '국가기관': '#ff7b4f',
  '지방자치단체': '#4fc3f7',
  '공공단체': '#a78bfa',
}

export function getMarkerColor(category) {
  return TYPE_COLORS[category] || '#8b92b8'
}

export function createMarkerImage(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 20 12 20s12-12.8 12-20C24 5.4 18.6 0 12 0z" fill="${color}" opacity="0.9"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
  </svg>`
  const encoded = encodeURIComponent(svg)
  return new window.kakao.maps.MarkerImage(
    `data:image/svg+xml,${encoded}`,
    new window.kakao.maps.Size(24, 32),
    { offset: new window.kakao.maps.Point(12, 32) }
  )
}
