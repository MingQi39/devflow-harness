#!/usr/bin/env bash
# GitHub Actions 部署结果推送飞书群（Open API 应用机器人）。
set -euo pipefail

FEISHU_APP_ID="${FEISHU_APP_ID:-cli_a9715c79b3f99cdd}"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET:-}"
FEISHU_CHAT_ID="${FEISHU_CHAT_ID:-oc_8074c4ae7b3baaadc402def9d9b603ae}"
[[ -z "${FEISHU_APP_ID// /}" ]] && FEISHU_APP_ID="cli_a9715c79b3f99cdd"
[[ -z "${FEISHU_CHAT_ID// /}" ]] && FEISHU_CHAT_ID="oc_8074c4ae7b3baaadc402def9d9b603ae"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET// /}"

DEPLOY_STATUS="${DEPLOY_STATUS:-unknown}"
DEPLOY_PROJECT="${DEPLOY_PROJECT:-}"
DEPLOY_REPO="${DEPLOY_REPO:-unknown}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-unknown}"
DEPLOY_SHA="${DEPLOY_SHA:-unknown}"
DEPLOY_ACTOR="${DEPLOY_ACTOR:-unknown}"
DEPLOY_RUN_URL="${DEPLOY_RUN_URL:-}"
DEPLOY_JOB_NAME="${DEPLOY_JOB_NAME:-deploy}"
DEPLOY_TITLE="${DEPLOY_TITLE:-}"

if [[ -z "$FEISHU_APP_SECRET" ]]; then
  echo "Feishu notify skipped: set GitHub secret FEISHU_APP_SECRET"
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Feishu notify skipped: jq not found" >&2
  exit 0
fi

project_label="${DEPLOY_PROJECT:-$DEPLOY_REPO}"

case "$DEPLOY_STATUS" in
  success)
    header="✅ ${project_label} 部署成功"
    template="green"
    ;;
  failure)
    header="❌ ${project_label} 部署失败"
    template="red"
    ;;
  cancelled)
    header="⚠️ ${project_label} 部署已取消"
    template="orange"
    ;;
  *)
    header="ℹ️ ${project_label} 部署结束 (${DEPLOY_STATUS})"
    template="grey"
    ;;
esac

short_sha="${DEPLOY_SHA:0:12}"
commit_line="${DEPLOY_TITLE:-(no commit message)}"
if [[ ${#commit_line} -gt 120 ]]; then
  commit_line="${commit_line:0:117}..."
fi

card_body="$(jq -nc \
  --arg header "$header" \
  --arg template "$template" \
  --arg project "$project_label" \
  --arg repo "$DEPLOY_REPO" \
  --arg branch "$DEPLOY_BRANCH" \
  --arg job "$DEPLOY_JOB_NAME" \
  --arg actor "$DEPLOY_ACTOR" \
  --arg sha "$short_sha" \
  --arg commit "$commit_line" \
  '{
    header: {title: {tag: "plain_text", content: $header}, template: $template},
    elements: [
      {tag: "div", fields: [
        {is_short: true, text: {tag: "lark_md", content: ("**项目**\n" + $project)}},
        {is_short: true, text: {tag: "lark_md", content: ("**仓库**\n" + $repo)}},
        {is_short: true, text: {tag: "lark_md", content: ("**分支**\n" + $branch)}},
        {is_short: true, text: {tag: "lark_md", content: ("**Job**\n" + $job)}},
        {is_short: true, text: {tag: "lark_md", content: ("**触发人**\n" + $actor)}},
        {is_short: true, text: {tag: "lark_md", content: ("**Commit**\n" + $sha)}}
      ]},
      {tag: "div", text: {tag: "lark_md", content: ("**说明**\n" + $commit)}}
    ]
  }')"

if [[ -n "$DEPLOY_RUN_URL" ]]; then
  card="$(jq -nc \
    --argjson body "$card_body" \
    --arg run_url "$DEPLOY_RUN_URL" \
    '$body + {
      elements: ($body.elements + [{
        tag: "action",
        actions: [{
          tag: "button",
          text: {tag: "plain_text", content: "查看 GitHub Actions"},
          type: "primary",
          url: $run_url
        }]
      }])
    }')"
else
  card="$card_body"
fi

token_resp="$(curl -sS -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg app_id "$FEISHU_APP_ID" --arg app_secret "$FEISHU_APP_SECRET" '{app_id: $app_id, app_secret: $app_secret}')" || true)"

token="$(jq -r '.tenant_access_token // empty' <<<"$token_resp")"
if [[ -z "$token" ]]; then
  echo "Feishu notify failed: cannot get tenant_access_token (app_id=${FEISHU_APP_ID})" >&2
  echo "$token_resp" >&2
  exit 0
fi

send_resp="$(curl -sS -X POST 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id' \
  -H "Authorization: Bearer ${token}" \
  -H 'Content-Type: application/json; charset=utf-8' \
  -d "$(jq -nc --arg chat_id "$FEISHU_CHAT_ID" --arg card "$card" \
    '{receive_id: $chat_id, msg_type: "interactive", content: $card}')" || true)"

if [[ "$(jq -r '.code // -1' <<<"$send_resp")" != "0" ]]; then
  echo "Feishu notify failed:" >&2
  echo "$send_resp" >&2
  exit 0
fi

echo "Feishu notify sent"
