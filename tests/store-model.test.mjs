import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  mapSearch,
  escapeHtml,
  businessHours,
  snapshotCandidates,
  demoPlaces,
} from "../store-model.mjs";
test("navigation searches the address, without sending made-up coordinates", () => {
  const u = new URL(
    mapSearch({
      storeName: "麦当劳 & 火车站",
      address: "广场1号",
      city: "广州",
    }),
  );
  assert.equal(u.searchParams.get("keyword"), "麦当劳 & 火车站 广场1号");
  assert.equal(u.searchParams.has("center"), false);
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
});

const snapshot = JSON.parse(
  await readFile(new URL("../data/stores.json", import.meta.url)),
);
test("snapshot results preserve the selected query origin", () => {
  const items = snapshotCandidates(snapshot, { city: "广州", hub: "广州东站" });
  assert.ok(items.length);
  assert.ok(
    items.every(
      (s) =>
        s.city === "广州" &&
        s.kw === "广州东站" &&
        s.is24h &&
        s.businessStatus !== false,
    ),
  );
  assert.deepEqual(
    items.map((s) => s.knownDistance),
    [...items.map((s) => s.knownDistance)].sort((a, b) => a - b),
  );
  assert.equal(
    snapshotCandidates(snapshot, { city: "广州", hub: "广州南站" }).length,
    0,
  );
  assert.ok(
    snapshotCandidates(snapshot, { city: "广州", hub: "广州南站", mode: "all" })
      .length,
  );
});
test("snapshot results never substitute a different hub for an empty sample", () => {
  assert.deepEqual(
    snapshotCandidates(snapshot, { city: "广州", hub: "unknown" }),
    [],
  );
  const items = snapshotCandidates(
    [{ city: "广州", kw: "广州站", is24h: true, distance: -1 }],
    { city: "广州", hub: "广州站" },
  );
  assert.equal(items[0].knownDistance, null);
});
test("business hours show full intervals and the next-day boundary", () => {
  assert.equal(businessHours({ is24h: true }), "24 小时营业");
  assert.equal(businessHours({ start: "07:00", end: "23:00" }), "07:00–23:00");
  assert.equal(
    businessHours({ start: "09:00", end: "02:00" }),
    "09:00–次日 02:00",
  );
  for (const store of [
    { end: "23:00" },
    { start: "99:00", end: "23:00" },
    { start: "09:00", end: "09:00" },
  ])
    assert.equal(businessHours(store), "营业时段待确认");
});

test("24h recommendations exclude paused stores and all results put them last", () => {
  const records = [
    {
      city: "广州",
      kw: "广州站",
      storeCode: "paused",
      is24h: true,
      businessStatus: false,
      distance: 10,
    },
    {
      city: "广州",
      kw: "广州站",
      storeCode: "overnight",
      is24h: true,
      businessStatus: true,
      distance: 200,
    },
    {
      city: "广州",
      kw: "广州站",
      storeCode: "regular",
      is24h: false,
      start: "07:00",
      end: "23:00",
      distance: 100,
    },
    {
      city: "北京",
      kw: "广州站",
      storeCode: "other-city",
      is24h: true,
      distance: 1,
    },
  ];
  assert.deepEqual(
    snapshotCandidates(records, { city: "广州", hub: "广州站" }).map(
      (s) => s.storeCode,
    ),
    ["overnight"],
  );
  assert.deepEqual(
    snapshotCandidates(records, {
      city: "广州",
      hub: "广州站",
      mode: "all",
    }).map((s) => s.storeCode),
    ["regular", "overnight", "paused"],
  );
});

const places = JSON.parse(
  await readFile(new URL("../data/hubs.json", import.meta.url)),
);
test("every displayed city and place has an available overnight result", () => {
  const visible = demoPlaces(snapshot, places);
  assert.ok(visible.length);
  assert.equal(
    visible.some((place) => place.city === "杭州"),
    false,
  );
  assert.equal(
    visible.some((place) => place.city === "天津"),
    false,
  );
  assert.equal(
    visible.some((place) => place.city === "西安"),
    false,
  );
  assert.equal(
    visible.some((place) => place.kw === "广州南站"),
    false,
  );
  for (const place of visible) {
    assert.ok(
      snapshotCandidates(snapshot, { city: place.city, hub: place.kw }).length,
    );
  }
});
test("all published demo examples lead to available overnight stores", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const examples = [
    ...html.matchAll(/data-city="([^"]+)"\s+data-hub="([^"]+)"/g),
  ];
  assert.ok(examples.length >= 8);
  const visible = demoPlaces(snapshot, places);
  for (const [, city, hub] of examples) {
    assert.ok(
      visible.some((place) => place.city === city && place.kw === hub),
      `${city} ${hub}`,
    );
  }
});
test("demo places reject absent or paused samples and invalid coordinates", () => {
  const samples = [
    { city: "广州", kw: "广州站", is24h: true, businessStatus: false },
    { city: "广州", kw: "广州东站", is24h: true },
  ];
  const hubs = [
    { city: "广州", kw: "广州站", lat: 23, lng: 113 },
    { city: "广州", kw: "广州东站", lat: 0, lng: 0 },
    { city: "北京", kw: "广州东站", lat: 40, lng: 116 },
  ];
  assert.deepEqual(demoPlaces(samples, hubs), []);
});
