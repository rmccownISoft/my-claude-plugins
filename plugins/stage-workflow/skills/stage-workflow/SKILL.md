---
name: stage-workflow
description: 'Move an issue to its next workflow stage, or check whether it can move. Stages, gates and next steps are defined in workflow.yaml and decided by a tested script, not by reading this file. Use when the user asks to promote, progress or advance an issue, or asks what stage it is in.'
---

# Stage workflow

**Status: draft.** The stages in `workflow.yaml` are an example copied from the ISoft
ai-workflow plugin. Replace them with your own.

The workflow is defined in `${CLAUDE_PLUGIN_ROOT}/skills/stage-workflow/workflow.yaml`.
Do not work out a gate, a next stage or a label set yourself. Run the script and do what it prints.

## Promote an issue

1. **Read the issue** from the tracker and write a snapshot to a temp file, `issue.json`.
   This is the judgment step: each field must reflect what is really on the issue.

   | Field           | What to put there                                                    |
   | --------------- | -------------------------------------------------------------------- |
   | `key`           | the issue key                                                        |
   | `issueType`     | Story, Task, Bug, …                                                  |
   | `labels`        | **every** label on the issue, unchanged                              |
   | `flagged`       | true if the issue is flagged                                         |
   | `openQuestions` | ids of questions with no recorded answer, e.g. `["Q2"]`              |
   | `sections`      | headings present in the description, e.g. `["Acceptance Criteria"]`  |
   | `artifacts`     | names the gates ask for that exist, e.g. `["scout-report"]`          |
   | `pr`            | `{ "state": "draft" \| "ready" \| "merged" }`, if the issue has a PR |
   | `children`      | `[{ "key", "labels" }]` for each child issue                         |
   | `facts`         | anything a `when:` branch tests, e.g. `{ "fixScope": "one-repo" }`   |

2. **Run the script:**

   ```sh
   node ${CLAUDE_PLUGIN_ROOT}/skills/stage-workflow/scripts/workflow.mjs promote ${CLAUDE_PLUGIN_ROOT}/skills/stage-workflow/workflow.yaml issue.json
   ```

3. **Act on its output.**
   - Exit 1, `"ok": false`: change nothing. Report each line of `failures` to the user as printed.
   - Exit 0, `"ok": true`: if `run` names a step, do that step first. If `platform` is `code` and
     you cannot read the repos, stop and say so. Then write `labels` as the issue's **full** label set.
   - Exit 2: a usage error. Fix the command; never guess the result.

4. **Report** the `from` and `to` stages and the labels now on the issue.

## Check the definition

After editing `workflow.yaml`, run `node …/scripts/workflow.mjs validate …/workflow.yaml`.
It must print `valid`.
