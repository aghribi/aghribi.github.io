# aghribi.github.io

- Type: personal website (GitHub user site)
- Status: published at https://aghribi.github.io (GitHub Pages, deployed by Actions on push to main)
- Started: 2026-10-27
- Purpose: public page for research, publications, talks, teaching, software and side projects.

## Folder map

| Path | Holds |
|---|---|
| `*.qmd` | pages (Quarto website) |
| `data/*.yml` | lists shown on the pages, built by `scripts/data.py` |
| `data/config.yml` | identifiers (ORCID, INSPIRE, GitHub), local source paths, thresholds |
| `data/*_extra.yml` | hand entries; each needs a public URL that resolves |
| `data/talks_exclude.yml` | Indico items that are meeting business, not talks |
| `data/*_review.yml` | items no database confirmed; local only, git-ignored |
| `_templates/` | listing templates |

## Update

```sh
uv run scripts/data.py all   # publications, talks, link check
quarto preview               # check locally
git commit -am "data: refresh" && git push   # GitHub Actions renders and deploys
```

An item reaches the page only when a database confirms it: INSPIRE, Crossref or DataCite (with the owner in the author list), CERN Indico (owner as speaker), or a resolving URL in an `*_extra.yml` file.
Papers with more than `collaboration_min_authors` authors are listed as collaboration papers.
