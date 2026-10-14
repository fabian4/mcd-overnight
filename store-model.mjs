export const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mapSearch(store) {
  const query = new URLSearchParams({
    keyword: store.storeName + " " + (store.address || ""),
    city: store.city,
    view: "map",
    src: "mcd-overnight",
    callnative: "1",
  });
  return "https://uri.amap.com/search?" + query;
}

export function businessHours(store) {
  if (store.is24h) return "24 小时营业";
  const valid = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "");
  if (!valid(store.start) || !valid(store.end) || store.start === store.end)
    return "营业时段待确认";
  return (
    store.start + "–" + (store.end < store.start ? "次日 " : "") + store.end
  );
}

export function snapshotCandidates(stores, { city, hub, mode = "24h" }) {
  return stores
    .filter(
      (s) =>
        s.city === city &&
        s.kw === hub &&
        (mode !== "24h" || (s.is24h && s.businessStatus !== false)),
    )
    .map((s) => ({
      ...s,
      knownDistance:
        Number.isFinite(s.distance) && s.distance >= 0 ? s.distance : null,
    }))
    .sort(
      (a, b) =>
        Number(a.businessStatus === false) -
          Number(b.businessStatus === false) ||
        (a.knownDistance ?? Infinity) - (b.knownDistance ?? Infinity),
    );
}

export function demoPlaces(stores, places) {
  const available = new Set(
    stores
      .filter((store) => store.is24h && store.businessStatus !== false)
      .map((store) => JSON.stringify([store.city, store.kw])),
  );
  return places.filter(
    (place) =>
      Number.isFinite(place.lat) &&
      Number.isFinite(place.lng) &&
      place.lat !== 0 &&
      place.lng !== 0 &&
      available.has(JSON.stringify([place.city, place.kw])),
  );
}
