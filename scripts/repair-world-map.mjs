// Split Natural Earth rings at the date line for Leaflet's flat world map.
import fs from 'node:fs';
const path = 'public/images/world-countries.geojson';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
function clip(ring, edge, keepGreater) {
  const result = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length], b = ring[i];
    const insideA = keepGreater ? a[0] >= edge : a[0] <= edge;
    const insideB = keepGreater ? b[0] >= edge : b[0] <= edge;
    if (insideA !== insideB) result.push([edge, a[1] + (b[1] - a[1]) * (edge - a[0]) / (b[0] - a[0])]);
    if (insideB) result.push(b);
  }
  return result;
}
function unwrap(ring) {
  const result = [ring[0]];
  for (const [x, y] of ring.slice(1)) {
    let longitude = x;
    while (longitude - result.at(-1)[0] > 180) longitude -= 360;
    while (longitude - result.at(-1)[0] < -180) longitude += 360;
    result.push([longitude, y]);
  }
  // Antarctica surrounds the pole. Close along the pole, not across its coastline.
  if (Math.abs(result.at(-1)[0] - result[0][0]) > 180) {
    result.push([result.at(-1)[0], -90], [result[0][0], -90], result[0]);
  }
  return result;
}
for (const feature of data.features) {
  const geometry = feature.geometry;
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  if (!polygons.some(p => p.some(r => r.some((point, i) => i && Math.abs(point[0] - r[i - 1][0]) > 180 && (point[1] > -85 || r[i - 1][1] > -85))))) continue;
  const pieces = [];
  for (const polygon of polygons) {
    const rings = polygon.map(unwrap);
    const xs = rings[0].map(p => p[0]);
    for (let band = Math.floor((Math.min(...xs) + 180) / 360); band <= Math.floor((Math.max(...xs) + 180) / 360); band++) {
      const clipped = rings.map(r => clip(clip(r, -180 + band * 360, true), 180 + band * 360, false))
        .map(r => r.map(([x, y]) => [x - band * 360, y]));
      if (clipped[0].length < 3) continue;
      const valid = clipped.filter(r => r.length >= 3).map(r => {
        if (JSON.stringify(r[0]) !== JSON.stringify(r.at(-1))) r.push(r[0]);
        return r;
      });
      pieces.push(valid);
    }
  }
  feature.geometry = { type: 'MultiPolygon', coordinates: pieces };
}
fs.writeFileSync(path, JSON.stringify(data));
