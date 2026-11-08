"""Warm the LangGraph schemas a CI shard needs, in parallel (CI step, no LLM).

The first request to /assistants/<id>/schemas makes `langgraphjs dev` extract that graph's schema
(several seconds each). Warming every graph one by one took ~3.5 min per shard; a shard only
records a few pages, so warm just the graphs its pages reach.

  python .qa/tools/warm_graphs.py --url http://localhost:8050 --pages "a,b,c" [--jobs 6]

Which graphs: the page's route folder under frontend/app (or src/) is scanned for agent names
(agent="x", agentId: "x") and runtime URLs (/api/copilotkit-xyz); those are mapped to graph ids
through the runtime route files (graphId: "..." and "name": "graph" pairs). Anything not
resolved falls back to warming every graph, so a miss costs time, never a broken take.
"""
import argparse, json, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path.cwd()


def http(url, data=None, timeout=240):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def page_routes(ids):
    cfg = ROOT / "autorecorder" / "config" / "pages.config.ts"
    if not cfg.exists():
        return None
    text = cfg.read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"\bid:\s*'([^']+)'", text):
        nxt = text.find("id: '", m.end())
        chunk = text[m.end(): nxt if nxt > 0 else len(text)]
        r = re.search(r"\broute:\s*'([^']*)'", chunk)
        if r:
            out[m.group(1)] = r.group(1)
    return {i: out.get(i) for i in ids}


def app_dirs():
    return [d for d in (ROOT / "frontend" / "app",) if d.is_dir()]


def runtime_maps():
    """(name -> graphs) from the main runtime route, (api folder -> graphs) for each route file."""
    names, by_api = {}, {}
    for base in app_dirs():
        api = base / "api"
        if not api.is_dir():
            continue
        for f in api.rglob("route.ts"):
            t = f.read_text(encoding="utf-8", errors="replace")
            folder = f.relative_to(api).parts[0]
            by_api[folder] = set(re.findall(r'graphId:\s*"([^"]+)"', t))
            for n, g in re.findall(r'"?([\w-]+)"?\s*:\s*"([\w-]+)"\s*,', t):
                names.setdefault(n, set()).add(g)
            for n, g in re.findall(r'([\w-]+):\s*new LangGraphAgent\(\{[^}]*?graphId:\s*"([^"]+)"', t, re.S):
                names.setdefault(n, set()).add(g)
    return names, by_api


def graphs_for(routes, all_graphs):
    names, by_api = runtime_maps()
    need, unresolved = set(), []
    for pid, route in routes.items():
        if route is None:
            unresolved.append(pid); continue
        files = []
        for base in app_dirs():
            d = base / route if route else base
            files += [d / "page.tsx"] if not route else [p for p in d.rglob("*.tsx") if "api" not in p.parts]
            files += list((base / route).glob("*.ts")) if route and (base / route).is_dir() else []
        files = [f for f in files if f.exists()]
        found = set()
        for f in files:
            t = f.read_text(encoding="utf-8", errors="replace")
            for api in re.findall(r'/api/(copilotkit[\w-]*)', t):
                found |= by_api.get(api, set())
            # any string literal naming an agent or graph (agent="x", const AGENT_ID = "x", ...)
            for n in set(re.findall(r'["\']([\w-]+)["\']', t)):
                found |= names.get(n, set()) | ({n} if n in all_graphs else set())
        if not found:
            found = {"sample_agent"} & all_graphs  # default agent of the main route
        if not found:
            unresolved.append(pid)
        need |= found
    return need & all_graphs, unresolved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--pages", default="")
    ap.add_argument("--jobs", type=int, default=6)
    a = ap.parse_args()
    try:
        assistants = json.loads(http(f"{a.url}/assistants/search", {"limit": 200}))
    except Exception as e:  # noqa: BLE001
        print(f"warm: could not list assistants ({e}); skipped"); return 0
    by_graph = {}
    for x in assistants:
        by_graph.setdefault(x.get("graph_id", x["assistant_id"]), x["assistant_id"])
    all_graphs = set(by_graph)
    ids = [p for p in a.pages.split(",") if p.strip()]
    routes = page_routes(ids) if ids else None
    if routes is None or not app_dirs():
        need, why = all_graphs, ("no page list" if not ids else "no pages.config.ts" if routes is None
                                 else "no frontend/app (route mapping is Next.js only): warming all")
    else:
        need, unresolved = graphs_for(routes, all_graphs)
        why = f"{len(ids)} page(s)"
        if unresolved:
            need, why = all_graphs, f"could not map {', '.join(unresolved)}: warming all"
    print(f"warm: {len(need)} of {len(all_graphs)} graphs ({why}): {' '.join(sorted(need))}")

    def warm(g):
        try:
            http(f"{a.url}/assistants/{by_graph[g]}/schemas")
            return g, "ok"
        except Exception as e:  # noqa: BLE001
            return g, f"failed ({str(e)[:60]})"

    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        for g, r in ex.map(warm, sorted(need)):
            print(f"  {g}: {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
