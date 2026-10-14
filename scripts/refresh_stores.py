#!/usr/bin/env python3
"""只读刷新 query-nearby-stores。禁止下单/领券等副作用工具。"""
from __future__ import annotations
import argparse, json, os, sys, time, urllib.request

URL = "https://mcp.mcd.cn"
BAN = {
    "create-order", "cancel-order", "mall-create-order", "party-order-create",
    "draw-lottery", "auto-bind-coupons", "delivery-create-address",
}
DEFAULT_KW = {
    "广州": ["广州站", "广州南站", "白云机场", "天河", "大学城"],
    "成都": ["成都东站", "天府机场", "双流机场", "春熙路"],
    "上海": ["上海站", "虹桥火车站", "浦东机场", "人民广场"],
}

class Client:
    def __init__(self, token: str):
        self.token = token
        self.sid = None
        self.n = 0

    def rpc(self, method, params=None, notify=False):
        self.n += 1
        body = {"jsonrpc": "2.0", "method": method}
        if not notify:
            body["id"] = self.n
        if params is not None:
            body["params"] = params
        h = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.sid:
            h["Mcp-Session-Id"] = self.sid
        req = urllib.request.Request(URL, json.dumps(body).encode(), h)
        with urllib.request.urlopen(req, timeout=30) as r:
            self.sid = r.headers.get("Mcp-Session-Id") or self.sid
            t = r.read().decode()
        if notify:
            return None
        if "data:" in t:
            t = [l[5:] for l in t.splitlines() if l.startswith("data:")][-1]
        return json.loads(t)

    def init(self):
        self.rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "mcd-overnight-refresh", "version": "0.1"},
        })
        try:
            self.rpc("notifications/initialized", notify=True)
        except Exception:
            pass

    def call(self, name: str, args: dict):
        assert name not in BAN, f"forbidden: {name}"
        return self.rpc("tools/call", {"name": name, "arguments": args})


def parse_body(resp):
    t = resp["result"]["content"][0]["text"]
    i = t.find('{"success"')
    if i < 0:
        return {}
    return json.JSONDecoder().raw_decode(t[i:])[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", required=True)
    ap.add_argument("--pace", type=float, default=1.0, help="seconds between calls")
    ap.add_argument("--out", default="data/refresh-out.json")
    args = ap.parse_args()
    token = os.environ.get("MCD_MCP_TOKEN")
    if not token:
        sys.exit("Set MCD_MCP_TOKEN (do not commit it)")
    kws = DEFAULT_KW.get(args.city)
    if not kws:
        sys.exit(f"No default keywords for {args.city}; edit DEFAULT_KW")
    c = Client(token)
    c.init()
    stores = {}
    for kw in kws:
        r = c.call("query-nearby-stores", {
            "beType": 1, "searchType": 2, "city": args.city, "keyword": kw,
        })
        d = parse_body(r)
        for s in d.get("data") or []:
            stores[s["storeCode"]] = {
                **{k: s.get(k) for k in (
                    "storeCode", "storeName", "address", "distance",
                    "businessStatus", "businessStartTime", "businessEndTime",
                )},
                "city": args.city, "kw": kw,
            }
        time.sleep(args.pace)
        print(kw, "→", len(d.get("data") or []), "stores", flush=True)
    out = list(stores.values())
    for s in out:
        s["is24h"] = s.get("businessStartTime") == "00:00" and s.get("businessEndTime") == "23:59"
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    json.dump(out, open(args.out, "w"), ensure_ascii=False, indent=1)
    print("wrote", args.out, "unique", len(out), "24h", sum(1 for x in out if x["is24h"]))


if __name__ == "__main__":
    main()
