# Proof Glass Action

A GitHub Action that enqueues your repository's Playwright visual regression
suite onto a trusted [Proof Glass](https://proofglass.io) runner, then waits for
and reports the result. It hands the job to a Proof Glass Edge Worker, polls
until the run finishes, and surfaces the job ID and final status back to your
workflow.

## Usage

```yaml
- uses: JonathanPorta/proofglass-action@v1
  with:
    # Required
    edge-url: ${{ vars.PROOFGLASS_EDGE_URL }}
    edge-token: ${{ secrets.PROOFGLASS_ACTION_TOKEN }}
    repo: ${{ github.repository }}
    sha: ${{ github.sha }}
    ref: ${{ github.ref_name }}

    # Optional (defaults shown)
    suite: visual
    required-capabilities: node,make,playwright,chromium
    required-labels: local,trusted
    timeout-seconds: '1800'
    poll-seconds: '10'
```

### Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `edge-url` | yes | — | Proof Glass Edge Worker URL |
| `edge-token` | yes | — | Token allowed to enqueue/poll visual jobs |
| `repo` | yes | — | GitHub repository in `owner/name` format |
| `sha` | yes | — | Commit SHA to test |
| `ref` | yes | — | Branch, tag, or ref name |
| `suite` | no | `visual` | Named suite to run |
| `required-capabilities` | no | `node,make,playwright,chromium` | Comma-separated required runner capabilities |
| `required-labels` | no | `local,trusted` | Comma-separated required runner labels |
| `timeout-seconds` | no | `1800` | Maximum time to wait for the remote visual result |
| `poll-seconds` | no | `10` | Poll interval |

### Outputs

| Output | Description |
| --- | --- |
| `job-id` | Proof Glass job ID |
| `status` | Final job status |

## About this repo

This repository contains the public, consumable Proof Glass action. `dist/` is a
vendored build of the action; its source and build pipeline are maintained privately.

Learn more at [proofglass.io](https://proofglass.io).
