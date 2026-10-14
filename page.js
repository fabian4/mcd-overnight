import {
  escapeHtml as esc,
  mapSearch,
  businessHours,
  snapshotCandidates,
  demoPlaces,
} from "./store-model.mjs";
const $ = (id) => document.getElementById(id);
let stores = [],
  hubs = [],
  rankings = [],
  city = "广州",
  hub = "广州东站",
  mode = "24h",
  limit = 5,
  map = null,
  markers = [],
  selectedCode = null,
  mapReady = false;
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

async function loadJson(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error("Snapshot could not be loaded");
  return response.json();
}
function currentHub() {
  return hubs.find((h) => h.city === city && h.kw === hub);
}
function formatDistance(value) {
  return value === null
    ? "距离未记录"
    : value < 1000
      ? "约 " + Math.round(value) + " 米"
      : "约 " + (value / 1000).toFixed(1) + " 公里";
}
function navigateLink(s, classes = "") {
  return `<a class="${classes}" href="${esc(mapSearch(s))}" target="_blank" rel="noopener noreferrer">导航过去 <span aria-hidden="true">↗</span></a>`;
}
function storeCard(s, index) {
  const paused = s.businessStatus === false;
  return `<article class="store-card ${index === 0 ? "featured" : ""} ${paused ? "paused" : ""}" data-store="${esc(s.storeCode)}">
  <div class="card-top"><span class="hours ${s.is24h ? "all-night" : ""}">${esc(businessHours(s))}</span>${paused ? '<span class="sample-state">记录为暂停营业</span>' : ""}</div>
  <h3>${esc(s.storeName)}</h3><p class="address">${esc(s.address || "地址待确认")}</p>
  <div class="card-bottom"><div><strong>${formatDistance(s.knownDistance)}</strong><small>距${esc(hub)} · 参考距离</small></div>${navigateLink(s, "navigate")}</div>
  ${paused ? "" : `<button class="range-button" type="button" data-range="${esc(s.storeCode)}">查看距离范围</button>`}
 </article>`;
}
function render() {
  const items = snapshotCandidates(stores, { city, hub, mode });
  if (!items.some((s) => s.storeCode === selectedCode))
    selectedCode =
      items.find((s) => s.businessStatus !== false)?.storeCode || null;
  $("result-title").textContent = mode === "24h" ? "通宵门店" : "营业时间一览";
  $("result-count").textContent = items.length + " 家门店";
  $("location-status").textContent = "以" + hub + "为出发地，距离仅供参考。";
  $("map-title").textContent = hub;
  const placeName = hub.startsWith(city) ? hub : city + hub;
  $("skill-prompt").textContent = /站|机场/.test(hub)
    ? `凌晨两点到${placeName}，想找家麦当劳等到早上六点。哪家通宵营业？给我地址和导航。`
    : `特种兵周末游${city}，晚上十一点在${hub}，想找家麦当劳吃点东西、歇一会儿，待到凌晨两点。附近哪家合适？给我完整营业时间和导航。`;
  $("results").innerHTML = items.length
    ? items.slice(0, limit).map(storeCard).join("")
    : `<div class="empty"><span class="empty-line" aria-hidden="true"></span><h3>${mode === "24h" ? "这里还没有通宵店记录" : "这里还没有门店记录"}</h3><p>${mode === "24h" ? "这份记录里暂时没找到。先看看其他门店开到几点，或让 Skill 查查现在有没有。" : "换个车站看看，或让 Skill 查查这里现在有哪些店。"}</p>${mode === "24h" ? '<button type="button" id="show-all">查看其他营业时段</button>' : ""}<a href="#use-skill">查查现在的营业时间</a></div>`;
  $("show-all")?.addEventListener("click", () => setMode("all"));
  $("results")
    .querySelectorAll("[data-range]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        selectedCode = button.dataset.range;
        renderRange();
        centerMap();
        if (window.innerWidth <= 760)
          $("map").scrollIntoView({
            behavior: reducedMotion ? "instant" : "smooth",
            block: "center",
          });
      }),
    );
  $("more").hidden = items.length <= limit;
  $("more").textContent = `再看 ${Math.min(5, items.length - limit)} 家门店`;
  document
    .querySelectorAll("[data-hub]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.hub === hub && button.dataset.city === city),
      ),
    );
  renderRange();
}
function setMode(value) {
  mode = value;
  limit = 5;
  for (const [id, value] of [
    ["tab-24h", "24h"],
    ["tab-all", "all"],
  ]) {
    $(id).classList.toggle("active", mode === value);
    $(id).setAttribute("aria-pressed", String(mode === value));
  }
  render();
}
function populateHubs() {
  const places = hubs.filter((h) => h.city === city);
  if (!places.some((h) => h.kw === hub)) hub = places[0]?.kw || "";
  $("hub-select").innerHTML = places
    .map((h) => `<option value="${esc(h.kw)}">${esc(h.kw)}</option>`)
    .join("");
  $("hub-select").value = hub;
}
function choosePlace(nextCity, nextHub) {
  city = nextCity;
  hub = nextHub;
  selectedCode = null;
  limit = 5;
  $("city-select").value = city;
  populateHubs();
  render();
  renderHubMarkers();
  centerMap();
}
function centerMap() {
  const place = currentHub();
  if (map && place)
    map.flyTo({
      center: [place.lng, place.lat],
      zoom: 13.5,
      essential: false,
      duration: reducedMotion ? 0 : 650,
    });
}
function rangeGeometry(place, metres) {
  const coordinates = [];
  for (let i = 0; i <= 96; i++) {
    const angle = (i / 96) * 2 * Math.PI;
    coordinates.push([
      place.lng +
        (metres * Math.sin(angle)) /
          (111320 * Math.cos((place.lat * Math.PI) / 180)),
      place.lat + (metres * Math.cos(angle)) / 111320,
    ]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}
function renderRange() {
  const place = currentHub(),
    store = stores.find((s) => s.storeCode === selectedCode);
  const metres =
    store &&
    store.city === city &&
    store.kw === hub &&
    Number.isFinite(store.distance) &&
    store.distance > 0
      ? store.distance
      : null;
  $("map-note").textContent = metres
    ? `${store.storeName} · 距${hub}${formatDistance(metres)}。圆环仅示意距离，方向未知。`
    : "这里标的是出发地。要去门店，请点“导航过去”。";
  if (!mapReady) return;
  map.getSource("distance-range")?.setData({
    type: "FeatureCollection",
    features: place && metres ? [rangeGeometry(place, metres)] : [],
  });
}
function renderHubMarkers() {
  if (!map) return;
  markers.forEach((marker) => marker.remove());
  markers = [];
  hubs
    .filter((h) => h.city === city)
    .forEach((place) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "hub-pin" + (place.kw === hub ? " selected" : "");
      el.textContent = place.kw;
      el.setAttribute("aria-label", "选择" + place.kw);
      el.addEventListener("click", () => choosePlace(place.city, place.kw));
      markers.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([place.lng, place.lat])
          .addTo(map),
      );
    });
}
function initMap() {
  if (!window.maplibregl) {
    $("map-note").textContent = "地图暂不可用，门店列表和地址导航仍可使用。";
    return;
  }
  const place = currentHub();
  try {
    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [place.lng, place.lat],
      zoom: 13.5,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("load", () => {
      map.addSource("distance-range", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "range-fill",
        type: "fill",
        source: "distance-range",
        paint: { "fill-color": "#c83628", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "range-line",
        type: "line",
        source: "distance-range",
        paint: {
          "line-color": "#c83628",
          "line-width": 1.5,
          "line-dasharray": [3, 4],
        },
      });
      mapReady = true;
      renderRange();
    });
    map.on("error", () => {
      $("map-note").textContent =
        "底图可能加载不完整，门店列表和地址导航仍可使用。";
    });
    renderHubMarkers();
  } catch {
    $("map-note").textContent = "地图暂不可用，门店列表和地址导航仍可使用。";
  }
}
function renderRanking() {
  $("ranking-city-count").textContent = `${rankings.length} 城记录`;
  $("ranking").innerHTML =
    `<table><caption>${rankings.length} 城通宵麦当劳记录。仅展示有通宵地点记录的城市，不代表全城门店数量。</caption><thead><tr><th>城市</th><th>指数</th><th>通宵店 / 已记录</th></tr></thead><tbody>${rankings.map((r) => `<tr><th scope="row"><button type="button" data-ranking-city="${esc(r.city)}">${esc(r.city)}</button></th><td>${r.score.toFixed(1)}</td><td>${r.h24} / ${r.n}</td></tr>`).join("")}</tbody></table>`;
  $("ranking")
    .querySelectorAll("button")
    .forEach((button) =>
      button.addEventListener("click", () => {
        choosePlace(button.dataset.rankingCity, "");
        $("city-select").focus();
        $("city-select").scrollIntoView({
          block: "center",
          behavior: reducedMotion ? "instant" : "smooth",
        });
      }),
    );
}
async function init() {
  try {
    [stores, hubs, rankings] = await Promise.all([
      loadJson("./data/stores.json"),
      loadJson("./data/hubs.json"),
      loadJson("./data/ranking.json"),
    ]);
    hubs = demoPlaces(stores, hubs);
    if (!hubs.length) throw new Error("No overnight demo places available");
    rankings = rankings.filter((r) => hubs.some((h) => h.city === r.city));
    document.querySelectorAll(".quick-places [data-hub]").forEach((button) => {
      if (
        !hubs.some(
          (h) => h.city === button.dataset.city && h.kw === button.dataset.hub,
        )
      )
        button.remove();
    });
    if (!hubs.some((h) => h.city === city && h.kw === hub)) {
      city = hubs[0].city;
      hub = hubs[0].kw;
    }
    const cities = [...new Set(hubs.map((h) => h.city))];
    $("city-select").innerHTML = cities
      .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
      .join("");
    $("city-select").disabled = false;
    $("hub-select").disabled = false;
    choosePlace(city, hub);
    renderRanking();
    initMap();
  } catch {
    $("results").innerHTML =
      '<div class="empty"><h3>门店记录没加载出来</h3><p>刷新试试，也可以让 Skill 帮你查现在的门店。</p><a href="#use-skill">看看怎么实时查</a><button type="button" id="retry">重新加载</button></div>';
    $("retry").onclick = () => window.location.reload();
    $("location-status").textContent = "数据加载失败，不代表附近没有门店。";
  }
}
$("city-select").addEventListener("change", () =>
  choosePlace($("city-select").value, ""),
);
$("hub-select").addEventListener("change", () =>
  choosePlace(city, $("hub-select").value),
);
$("tab-24h").onclick = () => setMode("24h");
$("tab-all").onclick = () => setMode("all");
$("more").onclick = () => {
  limit += 5;
  render();
};
$("recenter").onclick = centerMap;
document.querySelectorAll("[data-hub]").forEach(
  (button) =>
    (button.onclick = () => {
      if (hubs.length) choosePlace(button.dataset.city, button.dataset.hub);
    }),
);
$("copy-prompt").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("skill-prompt").textContent);
    $("copy-status").textContent =
      "复制好了，去安装了 Skill 的 AI 助手里问问吧。";
  } catch {
    $("copy-status").textContent =
      "没能自动复制，长按或选中上面这句话就能复制。";
  }
};
if (!reducedMotion && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 },
  );
  document
    .querySelectorAll(".skill-intro, .prompt-box, .ranking-section, footer")
    .forEach((element) => observer.observe(element));
}
init();
