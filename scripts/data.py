# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6", "bibtexparser>=1.4,<2"]
# ///
"""Build the site data files from public databases and the local bib files.

uv run scripts/data.py [publications|talks|projects|all]

Nothing reaches the page unless a database confirms it. Unconfirmed items go
to data/*_review.yml for a human to check.
"""
import datetime
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import bibtexparser
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CONFIG = yaml.safe_load((DATA / "config.yml").read_text())
CONFIG |= yaml.safe_load((DATA / "config.local.yml").read_text())


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": "aghribi.github.io data build", "Accept": accept})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            return json.loads(body) if accept == "application/json" else body.decode()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 2:
                raise
        except urllib.error.URLError:
            if attempt == 2:
                raise
        time.sleep(2 * (attempt + 1))


def doi_registered(doi):
    """doi.org handle API: responseCode 1 = registered. Publishers often block scripted page requests."""
    return (get(f"https://doi.org/api/handles/{urllib.parse.quote(doi)}") or {}).get("responseCode") == 1


def url_ok(url):
    if url.startswith("https://doi.org/"):
        return doi_registered(url.removeprefix("https://doi.org/"))
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "aghribi.github.io data build"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except urllib.error.URLError:
        return False


def dump(name, items):
    (DATA / name).write_text(yaml.safe_dump(items, allow_unicode=True, sort_keys=False, width=1000))
    print(f"{name}: {len(items)}")


def norm_title(t):
    t = re.sub(r"\\[`'^\"~=.uvHc]\{?([a-zA-Z])\}?", r"\1", t or "")  # LaTeX accents: \'e -> e
    t = unicodedata.normalize("NFKD", html.unescape(t)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", t.lower())


def norm_doi(doi):
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", (doi or "").lower().strip())
    m = re.match(r"^(?:10\.48550/)?arxiv[:.](\d{4}\.\d{4,5})$", doi)
    return f"10.48550/arxiv.{m.group(1)}" if m else doi or None


def jacow_venue(doi):
    """JACoW DOIs encode conference and paper id: 10.18429/jacow-ipac2019-tupmp006."""
    m = re.match(r"10\.18429/jacow-([a-z]+\d{4})-(\w+)$", doi or "")
    return f"JACoW {m.group(1).upper()}, {m.group(2).upper()}" if m else None


def is_me(name):
    return CONFIG["surname"].lower() in name.lower()


def fmt_authors(names):
    """Up to max_authors names; beyond that, the first three, et al., and the owner if hidden.
    The template bolds entries with me: true (Quarto escapes HTML in listing fields)."""
    names = [n for n in names if n]
    shown = names if len(names) <= CONFIG["max_authors"] else names[:3]
    out = [{"name": n, "me": is_me(n)} for n in shown]
    if len(shown) < len(names):
        out.append({"name": "et al.", "me": False})
        if not any(is_me(n) for n in shown):
            out.append({"name": f"incl. {CONFIG['display_name']}", "me": True})
    return out


def flip(name):
    """INSPIRE 'Last, First' to 'First Last'."""
    if "," in name:
        last, first = [p.strip() for p in name.split(",", 1)]
        return f"{first} {last}"
    return name


# ---------------------------------------------------------------- publications

INSPIRE_TYPES = {"article": "journal", "conference paper": "conference", "book": "book",
                 "book chapter": "book", "thesis": "thesis", "proceedings": "conference", "report": "report"}
CROSSREF_TYPES = {"journal-article": "journal", "proceedings-article": "conference", "book": "book",
                  "book-chapter": "book", "monograph": "book", "edited-book": "book", "report": "report",
                  "posted-content": "preprint", "dissertation": "thesis"}
DATACITE_TYPES = {"ConferencePaper": "conference", "JournalArticle": "journal", "Book": "book", "BookChapter": "book",
                  "Dataset": "dataset", "Software": "software", "Preprint": "preprint", "Dissertation": "thesis"}
BIB_TYPES = {"article": "journal", "inproceedings": "conference", "proceedings": "conference", "book": "book",
             "incollection": "book", "inbook": "book", "phdthesis": "thesis", "patent": "patent"}


def inspire_records():
    fields = ("titles.title,authors.full_name,author_count,dois.value,arxiv_eprints.value,publication_info,"
              "document_type,earliest_date,control_number,collaborations.value")
    q = urllib.parse.quote(f"a {CONFIG['inspire_bai']}")
    hits = get(f"https://inspirehep.net/api/literature?q={q}&size=500&fields={fields}")["hits"]["hits"]
    out = []
    for h in hits:
        m = h["metadata"]
        pi = (m.get("publication_info") or [{}])[0]
        venue = " ".join(str(x) for x in (pi.get("journal_title"), pi.get("journal_volume")) if x)
        page = pi.get("artid") or pi.get("page_start")
        if venue and page:
            venue += f", {page}"
        arxiv = (m.get("arxiv_eprints") or [{}])[0].get("value")
        doctype = (m.get("document_type") or ["article"])[0]
        year = pi.get("year") or m.get("earliest_date", "")[:4]
        doi = norm_doi((m.get("dois") or [{}])[0].get("value"))
        out.append({
            "title": m["titles"][0]["title"],
            "author_names": [flip(a["full_name"]) for a in m.get("authors", [])],
            "author_count": m.get("author_count") or len(m.get("authors", [])),
            "collaboration": ", ".join(c["value"] for c in m.get("collaborations", [])),
            "venue": venue or jacow_venue(doi) or (f"arXiv:{arxiv}" if arxiv else ""),
            "year": int(year) if year else None,
            "doi": doi,
            "arxiv": arxiv,
            "inspire": f"https://inspirehep.net/literature/{m['control_number']}",
            "type": "preprint" if doctype == "article" and not pi.get("journal_title") else INSPIRE_TYPES.get(doctype, "other"),
            "confirmed_by": "INSPIRE",
        })
    return out


def orcid_dois():
    works = get(f"https://pub.orcid.org/v3.0/{CONFIG['orcid']}/works")["group"]
    dois = set()
    for g in works:
        for e in g.get("external-ids", {}).get("external-id", []):
            if e["external-id-type"] == "doi":
                dois.add(norm_doi(e["external-id-value"]))
    return dois


def openalex_dois():
    """Catches DOIs missing from INSPIRE and ORCID (JACoW, Zenodo, books). Errata are skipped."""
    dois, cursor = set(), "*"
    while cursor:
        d = get(f"https://api.openalex.org/works?filter=author.orcid:{CONFIG['orcid']}&per-page=200"
                f"&select=doi,type&cursor={cursor}")
        dois |= {norm_doi(w["doi"]) for w in d["results"] if w["doi"] and w["type"] not in ("erratum", "paratext")}
        cursor = d["meta"].get("next_cursor") if d["results"] else None
    return dois


def bib_entries():
    out = []
    for f in sorted(Path(CONFIG["bib_dir"]).expanduser().glob("*.bib")):
        if f.stem in CONFIG["bib_skip"]:
            continue
        parser = bibtexparser.bparser.BibTexParser(common_strings=True)
        for e in bibtexparser.load(f.open(encoding="utf-8", errors="ignore"), parser=parser).entries:
            doi = norm_doi(e.get("doi"))
            out.append({"file": f.name, "key": e.get("ID"), "title": re.sub(r"[{}]", "", e.get("title", "")),
                        "year": e.get("year"), "type": BIB_TYPES.get(e.get("ENTRYTYPE"), "other"), "doi": doi,
                        "arxiv": e.get("eprint")})
    return out


def crossref(doi):
    d = get(f"https://api.crossref.org/works/{urllib.parse.quote(doi)}")
    if not d:
        return None
    m = d["message"]
    names = [" ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name", "") for a in m.get("author", [])]
    year = (m.get("issued", {}).get("date-parts") or [[None]])[0][0]
    venue = (m.get("container-title") or [m.get("publisher", "")])[0]  # books have no container
    if m.get("volume"):
        venue += f" {m['volume']}"
    if m.get("page") or m.get("article-number"):
        venue += f", {m.get('article-number') or m.get('page')}"
    title = re.sub(r"<[^>]+>", "", html.unescape((m.get("title") or [""])[0]))  # Crossref titles carry JATS tags
    return {"title": title, "author_names": names,
            "author_count": len(names), "collaboration": "", "venue": html.unescape(venue.strip()), "year": year,
            "doi": doi, "arxiv": None, "inspire": None, "type": CROSSREF_TYPES.get(m.get("type"), "other"),
            "confirmed_by": "Crossref"}


def datacite(doi):
    """arXiv, Zenodo and CERN DOIs are registered with DataCite, not Crossref."""
    d = get(f"https://api.datacite.org/dois/{urllib.parse.quote(doi)}")
    if not d:
        return None
    a = d["data"]["attributes"]
    names = [flip(c.get("name", "")) for c in a.get("creators", [])]
    arxiv = doi.split("arxiv.")[1] if doi.startswith("10.48550/arxiv.") else None
    kind = a["types"].get("resourceTypeGeneral", "")
    return {"title": a["titles"][0]["title"], "author_names": names, "author_count": len(names),
            "collaboration": "", "venue": f"arXiv:{arxiv}" if arxiv else jacow_venue(doi) or a.get("publisher", ""),
            "year": a.get("publicationYear"), "doi": doi, "arxiv": arxiv, "inspire": None,
            "type": "preprint" if arxiv else DATACITE_TYPES.get(kind, "report"),
            "confirmed_by": "DataCite"}


def publications():
    records = inspire_records()
    by_doi = {r["doi"]: r for r in records if r["doi"]}
    by_doi |= {f"10.48550/arxiv.{r['arxiv']}": r for r in records if r["arxiv"]}
    titles = {norm_title(r["title"]) for r in records}
    bib = bib_entries()
    review = []

    candidates = orcid_dois() | openalex_dois() | {b["doi"] for b in bib if b["doi"]}
    for doi in sorted(candidates - set(by_doi)):
        r = crossref(doi) or datacite(doi)
        if r is None:
            review.append({"doi": doi, "reason": "DOI not found on Crossref or DataCite"})
            continue
        if not any(is_me(n) for n in r["author_names"]):
            review.append({"doi": doi, "title": r["title"], "reason": "registry author list lacks the owner"})
            continue
        records.append(r)
        by_doi[doi] = r
        titles.add(norm_title(r["title"]))

    for b in bib:
        if b["doi"] or norm_title(b["title"]) in titles:
            continue
        review.append({"source": f"{b['file']}:{b['key']}", "title": b["title"], "year": b["year"],
                       "reason": "no DOI and not in INSPIRE"})

    for x in yaml.safe_load((DATA / "publications_extra.yml").read_text()) or []:
        if not url_ok(x["url"]):
            review.append({"title": x["title"], "url": x["url"], "reason": "extra entry URL does not resolve"})
            continue
        records.append({**x, "author_names": x.get("author_names", [CONFIG["display_name"]]),
                        "author_count": len(x.get("author_names", [1])), "collaboration": "",
                        "confirmed_by": x["url"]})

    for r in records:
        if r.get("doi") and not doi_registered(r["doi"]):
            review.append({"doi": r["doi"], "title": r["title"], "reason": "DOI not registered yet; listed without DOI link"})
            r["doi"] = None

    # Preprints, DOI-less copies and DataCite repository mirrors fold into the published record with the
    # same title and the nearest year. Distinct papers can share a title (QUBIC 2011, 2012, 2017), hence the year.
    copy = lambda r: r["type"] == "preprint" or not r.get("doi") or (r["confirmed_by"] == "DataCite" and r["type"] != "dataset")
    published = {}
    for r in records:
        if not copy(r):
            published.setdefault(norm_title(r["title"]), []).append(r)
    kept = []
    for r in records:
        twins = [t for t in published.get(norm_title(r["title"]), []) if abs((t["year"] or 0) - int(r["year"] or 0)) <= 2]
        if copy(r) and twins:
            twin = min(twins, key=lambda t: abs((t["year"] or 0) - int(r["year"] or 0)))
            twin["arxiv"] = twin.get("arxiv") or r.get("arxiv")
            twin["inspire"] = twin.get("inspire") or r.get("inspire")
        else:
            kept.append(r)

    excluded = set(CONFIG["publications_exclude"])
    out = []
    for r in kept:

        if r.get("doi") in excluded or r.get("inspire") in excluded:
            continue
        cat = "collaboration" if r["author_count"] > CONFIG["collaboration_min_authors"] else r["type"]
        out.append({"title": r["title"], "authors": fmt_authors(r["author_names"]), "venue": r["venue"],
                    "year": r["year"], "category": cat, "collaboration": r["collaboration"] or None,
                    "doi": r.get("doi"), "arxiv": r.get("arxiv"), "inspire": r.get("inspire"),
                    "url": r.get("url"), "confirmed_by": r["confirmed_by"]})
    out.sort(key=lambda r: (-(r["year"] or 0), r["title"]))
    dump("publications.yml", out)
    dump("publications_review.yml", review)


# ---------------------------------------------------------------- talks

def talks():
    host = CONFIG["indico"]
    results, page = [], 1
    while True:
        d = get(f"{host}/search/api/search?q={CONFIG['surname']}&type=contribution&page={page}")
        results += d["results"]
        if not d["results"] or len(results) >= d["total"]:
            break
        page += 1
    exclude = {x["url"] for x in yaml.safe_load((DATA / "talks_exclude.yml").read_text()) or []}
    out, seen = [], set()
    for event_id in sorted({r["event_id"] for r in results}):
        ev = get(f"{host}/export/event/{event_id}.json?detail=contributions")["results"][0]
        for c in ev.get("contributions", []):
            if not any(is_me(f"{s.get('first_name', '')} {s.get('last_name', '')}") for s in c.get("speakers", [])):
                continue
            if c["url"] in exclude or c["url"] in seen:
                continue
            seen.add(c["url"])
            date = (c.get("startDate") or ev["startDate"])["date"]
            out.append({"date": date, "title": c["title"].strip(), "event": ev["title"].strip(),
                        "location": ev.get("location") or None, "url": c["url"], "confirmed_by": "CERN Indico"})

    review = []
    for x in yaml.safe_load((DATA / "talks_extra.yml").read_text()) or []:
        if url_ok(x["url"]):
            out.append({**x, "date": str(x["date"]), "confirmed_by": x["url"]})
        else:
            review.append({**x, "reason": "URL does not resolve"})
    today = datetime.date.today().isoformat()
    out = sorted((t for t in out if t["date"] <= today), key=lambda t: t["date"], reverse=True)  # upcoming talks wait
    dump("talks.yml", out)

    dated = {t["date"] for t in out}
    pres = Path(CONFIG["presentations_dir"]).expanduser()
    for d in sorted(p for p in pres.glob("20*/*") if p.is_dir()):
        m = re.match(r"(\d{4})(\d{2})(\d{2})?", d.name)
        if m and m.group(3) and f"{m.group(1)}-{m.group(2)}-{m.group(3)}" in dated:
            continue
        review.append({"folder": f"{d.parent.name}/{d.name}", "reason": "local talk with no public record found"})
    dump("talks_review.yml", review)


# ---------------------------------------------------------------- projects

def projects():
    """Hand-written cards: fail if any link is dead."""
    dead = [(p["title"], l["url"]) for p in yaml.safe_load((DATA / "projects.yml").read_text())
            for l in p.get("links", []) if not url_ok(l["url"])]
    for title, url in dead:
        print(f"dead link: {title}: {url}")
    if dead:
        sys.exit(1)
    print("projects.yml: all links resolve")



if __name__ == "__main__":
    jobs = {"publications": publications, "talks": talks, "projects": projects}
    for name in (jobs if sys.argv[1:] in ([], ["all"]) else sys.argv[1:]):
        jobs[name]()
