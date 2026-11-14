# GitHub Action

Every merged PR is a labelled example: its title and description are the task, and the files it changed
are the answer. The Klew Action feeds each merge into the graph, so the context agents get keeps
improving without any change to how your team works.

## Setup

1. Run HydraDB somewhere your CI can reach, and store `HYDRA_URI` and `HYDRA_TOKEN` as repository secrets.
2. Add this workflow to the repository you want to learn from:

```yaml
name: klew-learn
on:
  pull_request:
    types: [closed]
jobs:
  learn:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: IronicRayquaza/klew/action@main
        with:
          hydra-uri: ${{ secrets.HYDRA_URI }}
          hydra-token: ${{ secrets.HYDRA_TOKEN }}
```

## Inputs

| Input | Required | Default | |
|---|---|---|---|
| `hydra-uri` | yes | | Bolt URI of the HydraDB node |
| `hydra-token` | yes | | HydraDB bearer token |
| `repo-key` | no | repository name | Graph key |
| `reindex` | no | `true` | Re-index structure before learning, so new files and symbols exist |

## What it runs

```bash
klew index . --name "$REPO_KEY" --history 500     # when reindex is true
klew learn-git "$MERGE_COMMIT_SHA" --repo "$REPO_KEY"
```

Re-indexing replaces structure (files, symbols, calls), but learned edges survive it: structure is fact,
experience is learned on top. The same flow works locally with `klew learn-git HEAD~50..HEAD`.
