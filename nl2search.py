import argparse, csv, datetime, json, os, re, sys, time
import xml.etree.ElementTree as ET
import requests

EMAIL = os.getenv("NCBI_EMAIL", "")
LOG = "search_log.csv"
UA = {"User-Agent": f"nl2search/2.0 (mailto:{EMAIL})"}

PROMPT = """You are a medical librarian building a systematic-review search strategy.
Return ONLY JSON, no prose, no code fences:
{{"blocks":[{{"name":"population|exposure|outcome","mesh":["exact MeSH descriptor names"],
"free":["lower-case title/abstract synonyms, * for truncation, phrases allowed"]}}]}}
Rules: 2-3 blocks only (never a study-design block); 3-8 MeSH candidates and 6-15 free-text synonyms per block;
include British/American spelling variants and Indian-context terms where relevant.
Question: {q}"""


def _json(text):
    return json.loads(re.sub(r"```json|```", "", text).strip())


def ask_gemini(q):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("no GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        json={"contents": [{"parts": [{"text": PROMPT.format(q=q)}]}],
              "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}},
        timeout=90)
    r.raise_for_status()
    return _json(r.json()["candidates"][0]["content"]["parts"][0]["text"])


def ask_groq(q):
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise RuntimeError("no GROQ_API_KEY")
    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={"model": "openai/gpt-oss-120b", "temperature": 0.2,
              "response_format": {"type": "json_object"},
              "messages": [{"role": "user", "content": PROMPT.format(q=q)}]},
        timeout=90)
    r.raise_for_status()
    return _json(r.json()["choices"][0]["message"]["content"])


STOP = {"the", "a", "an", "is", "are", "of", "to", "among", "between", "does", "do", "what", "how", "on", "effect"}
SPLIT = r"\b(?:associated with|and|in|among|with|for|on|during|between|of|versus|vs\.?)\b"


def ask_rules(q):
    chunks = [c.strip(" ?.,") for c in re.split(SPLIT, q.lower()) if c.strip(" ?.,")]
    blocks = []
    for i, c in enumerate(chunks[:3]):
        words = [w for w in c.split() if w not in STOP]
        if not words:
            continue
        phrase = " ".join(words)
        free = {phrase} | {w + "*" if len(w) > 5 else w for w in words}
        blocks.append({"name": f"concept{i + 1}", "mesh": [phrase.title()] + [w.title() for w in words],
                       "free": sorted(free)})
    return {"blocks": blocks}


def extract(q):
    for name, fn in (("Gemini", ask_gemini), ("Groq", ask_groq), ("rule-based", ask_rules)):
        try:
            out = fn(q)
            if out.get("blocks"):
                print(f"   concepts extracted by: {name}")
                return out
        except Exception as e:
            print(f"   {name} unavailable ({str(e)[:80]}) -> next fallback")
    raise SystemExit("No extraction method worked")


def verify_mesh(term):
    for match in ("exact", "startswith"):
        try:
            r = requests.get("https://id.nlm.nih.gov/mesh/lookup/descriptor",
                             params={"label": term, "match": match, "limit": 3}, timeout=20)
            r.raise_for_status()
            hits = r.json()
            if hits:
                return hits[0]["label"]
        except Exception:
            pass
    return None


def validate(blocks):
    for b in blocks:
        ok, bad = set(), []
        for t in b.get("mesh", []):
            c = verify_mesh(t)
            (ok.add(c) if c else bad.append(t))
        b["mesh"] = sorted(ok)
        b["mesh_dropped_unverified"] = bad
        b["free"] = sorted({f.strip().lower() for f in b.get("free", []) if f.strip()})
    return blocks


def q_(t):
    return f'"{t}"' if " " in t else t

def nostar(t):
    return t.replace("*", "")

def single_words(b):
    return sorted({nostar(t).lower() for t in b["free"] + b["mesh"] if " " not in t})


def r_pubmed(B, o):
    s = " AND ".join("(" + " OR ".join([f'"{m}"[Mesh]' for m in b["mesh"]] + [f"{q_(f)}[tiab]" for f in b["free"]]) + ")" for b in B)
    if o.get("year_from") or o.get("year_to"):
        s += f' AND ("{o.get("year_from") or 1800}"[dp] : "{o.get("year_to") or 3000}"[dp])'
    return s

def r_epmc(B, o):
    s = " AND ".join("(" + " OR ".join([f'MESH:"{m}"' for m in b["mesh"]] + [f"(TITLE:{q_(f)} OR ABSTRACT:{q_(f)})" for f in b["free"]]) + ")" for b in B)
    if o.get("year_from") or o.get("year_to"):
        s += f' AND (PUB_YEAR:[{o.get("year_from") or 1800} TO {o.get("year_to") or 3000}])'
    return s

def r_preprint(server):
    def f(B, o):
        s = " AND ".join("(" + " OR ".join(f"(TITLE:{q_(t)} OR ABSTRACT:{q_(t)})" for t in b["free"] + b["mesh"]) + ")" for b in B)
        return f'({s}) AND SRC:PPR AND PUBLISHER:"{server}"'
    return f

def r_plain_bool(B, o):
    return " AND ".join("(" + " OR ".join(f'"{nostar(t)}"' if " " in t else nostar(t) for t in sorted(set(b["free"] + b["mesh"]))) + ")" for b in B)

def r_ctgov(B, o):
    return " AND ".join("(" + " OR ".join(q_(nostar(t)) for t in sorted(set(b["free"] + b["mesh"]))) + ")" for b in B)

def r_crossref(B, o):
    return " ".join(sorted({nostar(t) for b in B for t in (b["mesh"] or b["free"][:3])}))

def r_arxiv(B, o):
    return " AND ".join("(" + " OR ".join(f'all:"{nostar(t)}"' for t in sorted(set(b["free"] + b["mesh"]))) + ")" for b in B)

def r_openaire(B, o):
    return " ".join(sorted({nostar(t) for b in B for t in (b["mesh"][:1] or b["free"][:1])}))

def r_dblp(B, o):
    return " ".join("|".join(single_words(b)[:6]) for b in B)

def r_s2(B, o):
    return " + ".join("(" + " | ".join(f'"{t}"' if " " in t else t for t in sorted(set(b["free"] + [m.lower() for m in b["mesh"]]))) + ")" for b in B)

def r_scholar(B, o):
    return " ".join("(" + " OR ".join(q_(nostar(t)) for t in (b["mesh"][:2] + b["free"][:3])) + ")" for b in B)


def get(url, **kw):
    r = requests.get(url, headers=UA, timeout=60, **kw)
    r.raise_for_status()
    return r

def run_pubmed(q, o):
    p = {"db": "pubmed", "term": q, "retmode": "json", "retmax": 0, "tool": "nl2search", "email": EMAIL}
    if os.getenv("NCBI_API_KEY"):
        p["api_key"] = os.environ["NCBI_API_KEY"]
    d = get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params=p).json()["esearchresult"]
    return int(d["count"]), "PubMed translation: " + d.get("querytranslation", "")

def run_epmc(q, o):
    return int(get("https://www.ebi.ac.uk/europepmc/webservices/rest/search", params={"query": q, "format": "json", "pageSize": 1}).json()["hitCount"]), ""

def run_openalex(q, o):
    flt = f"title_and_abstract.search:{q}"
    if o.get("year_from"): flt += f",from_publication_date:{o['year_from']}-01-01"
    if o.get("year_to"): flt += f",to_publication_date:{o['year_to']}-12-31"
    return int(get("https://api.openalex.org/works", params={"filter": flt, "per-page": 1, "mailto": EMAIL}).json()["meta"]["count"]), ""

def run_doaj(q, o):
    from urllib.parse import quote
    return int(get(f"https://doaj.org/api/search/articles/{quote(q, safe='')}", params={"pageSize": 1}).json()["total"]), "no year filter applied"

def run_crossref(q, o):
    p = {"query": q, "rows": 0, "mailto": EMAIL}
    f = []
    if o.get("year_from"): f.append(f"from-pub-date:{o['year_from']}")
    if o.get("year_to"): f.append(f"until-pub-date:{o['year_to']}")
    if f: p["filter"] = ",".join(f)
    return int(get("https://api.crossref.org/works", params=p).json()["message"]["total-results"]), "relevance-ranked, not Boolean: count is an upper bound"

def run_arxiv(q, o):
    root = ET.fromstring(get("http://export.arxiv.org/api/query", params={"search_query": q, "max_results": 0}).text)
    return int(root.find("{http://a9.com/spec/opensearch/1.1/}totalResults").text), "arXiv is non-medical: expect low yield"

def run_openaire(q, o):
    d = get("https://api.openaire.eu/graph/v1/researchProducts", params={"search": q, "pageSize": 1}).json()
    return int(d["header"]["numFound"]), "keyword search on top terms only"

def run_dblp(q, o):
    d = get("https://dblp.org/search/publ/api", params={"q": q, "format": "json", "h": 0}).json()
    return int(d["result"]["hits"]["@total"]), "computer-science index: low relevance for clinical topics"

def run_zenodo(q, o):
    return int(get("https://zenodo.org/api/records", params={"q": q, "size": 1}).json()["hits"]["total"]), ""

def run_s2(q, o):
    h = {"x-api-key": os.environ["S2_API_KEY"]} if os.getenv("S2_API_KEY") else {}
    p = {"query": q}
    if o.get("year_from") or o.get("year_to"):
        p["year"] = f"{o.get('year_from') or ''}-{o.get('year_to') or ''}"
    time.sleep(1.1)
    r = requests.get("https://api.semanticscholar.org/graph/v1/paper/search/bulk", params=p, headers={**UA, **h}, timeout=60)
    r.raise_for_status()
    return int(r.json()["total"]), ""

def run_ctgov(q, o):
    d = get("https://clinicaltrials.gov/api/v2/studies", params={"query.term": q, "pageSize": 1, "countTotal": "true"}).json()
    return int(d["totalCount"]), "registered trials, not articles"


DB = {
    "pubmed":     ("MEDLINE via PubMed", r_pubmed, run_pubmed),
    "openalex":   ("OpenAlex", r_plain_bool, run_openalex),
    "doaj":       ("DOAJ", r_plain_bool, run_doaj),
    "biorxiv":    ("bioRxiv (via Europe PMC preprint index)", r_preprint("bioRxiv"), run_epmc),
    "medrxiv":    ("medRxiv (via Europe PMC preprint index)", r_preprint("medRxiv"), run_epmc),
    "crossref":   ("Crossref", r_crossref, run_crossref),
    "arxiv":      ("arXiv", r_arxiv, run_arxiv),
    "openaire":   ("OpenAIRE", r_openaire, run_openaire),
    "dblp":       ("dblp", r_dblp, run_dblp),
    "zenodo":     ("Zenodo", r_plain_bool, run_zenodo),
    "scholar":    ("Google Scholar (manual)", r_scholar, None),
    "s2":         ("Semantic Scholar", r_s2, run_s2),
    "ctgov":      ("ClinicalTrials.gov", r_ctgov, run_ctgov),
    "europepmc":  ("Europe PMC", r_epmc, run_epmc),
}
DEFAULT = ["pubmed", "openalex", "doaj", "biorxiv", "medrxiv", "crossref", "openaire", "dblp"]


def log_row(r):
    new = not os.path.exists(LOG)
    with open(LOG, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "database", "mode", "hits", "query", "note", "searcher"])
        if new:
            w.writeheader()
        w.writerow(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("question", nargs="?", default="")
    ap.add_argument("--blocks", help="approved/edited strategy.json (skips the LLM)")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--dbs", default="default", help="'default' (UI's 8), 'all', or comma list: " + ",".join(DB))
    ap.add_argument("--year-from", type=int)
    ap.add_argument("--year-to", type=int)
    ap.add_argument("--searcher", default="")
    a = ap.parse_args()
    opts = {"year_from": a.year_from, "year_to": a.year_to}

    if a.blocks:
        blocks = json.load(open(a.blocks, encoding="utf-8"))["blocks"]
    else:
        if not a.question:
            sys.exit("Give a question, or --blocks strategy.json")
        print("1) Extracting concepts")
        blocks = validate(extract(a.question)["blocks"])
        json.dump({"question": a.question, "blocks": blocks}, open("strategy.json", "w", encoding="utf-8"), indent=2)
        print("2) MeSH verified against NLM -> strategy.json saved")
        for b in blocks:
            if b["mesh_dropped_unverified"]:
                print(f"   dropped (not real MeSH) [{b['name']}]: {b['mesh_dropped_unverified']}")
        if not a.run:
            print("   REVIEW/EDIT strategy.json, then run: python nl2search.py --blocks strategy.json --run")

    keys = list(DB) if a.dbs == "all" else DEFAULT if a.dbs == "default" else [k.strip() for k in a.dbs.split(",")]
    today = datetime.date.today().isoformat()
    outdir = f"strings_{today}"
    os.makedirs(outdir, exist_ok=True)
    print(f"3) Strings -> {outdir}/" + ("  and running searches" if a.run else ""))

    for k in keys:
        label, render, runner = DB[k]
        q = render(blocks, opts)
        open(os.path.join(outdir, f"{k}.txt"), "w", encoding="utf-8").write(q)
        if a.run and runner:
            try:
                hits, note = runner(q, opts)
                log_row({"date": today, "database": label, "mode": "API", "hits": hits, "query": q, "note": note, "searcher": a.searcher})
                print(f"   {label}: {hits:,} hits" + (f"  [{note}]" if note else ""))
            except Exception as e:
                print(f"   {label}: FAILED - {str(e)[:100]}")
            time.sleep(0.4)
        else:
            if a.run:
                log_row({"date": today, "database": label, "mode": "manual" if runner is None else "string only",
                         "hits": "", "query": q, "note": "run in the web interface, record count, export RIS", "searcher": a.searcher})
            print(f"   {label}: string saved ({'manual search' if runner is None else 'not run'})")
    print(f"\nLog: {LOG}")


if __name__ == "__main__":
    main()
PYEOF
echo done