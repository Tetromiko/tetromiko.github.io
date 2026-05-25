# Open Jamstack Portfolio (Dev Factory)

This repository is the development factory for an open-source portfolio editor built with React, Tailwind, GitHub Pages, and GitHub API.

## Branch model

- `dev`: developer environment (experiments, tooling, self-host mode)
- `main`: clean template output for end users

`main` should be generated from `dev` through CI (`build-template.yml`), not edited manually.

## Runtime modes

- `self-host` (`localhost`): `/admin` is open for fast UI development; saves are local-only
- `github-pages` (`*.github.io`): `/admin` requires PAT + write access and saves to GitHub API

## Local development

```bash
npm install
npm run dev
```

## Template export

```bash
npm run template:check
```

This command builds the app and generates a clean export in `.template-export/`.

## Data contract (minimum)

`public/portfolio-data.json` must include:

```json
{
  "schemaVersion": 1,
  "profile": {
    "name": "",
    "title": "",
    "location": "",
    "summary": ""
  },
  "contacts": {
    "email": "",
    "linkedin": ""
  }
}
```
