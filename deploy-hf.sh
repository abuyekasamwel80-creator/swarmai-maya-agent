#!/bin/bash
set -e

SPACE_NAME="${1:-swarmai-maya}"
HF_USER="${HF_USER:-$(huggingface-cli whoami 2>/dev/null | head 1)}"

if [ -z "$HF_TOKEN" ]; then
  echo "ERROR: HF_TOKEN is not set."
  echo "  export HF_TOKEN=\"hf_your_token_here\""
  exit 1
fi

if [ -z "$HF_USER" ]; then
  echo "ERROR: Could not determine HuggingFace username."
  echo "  Run: huggingface-cli login"
  exit 1
fi

echo "SwarmAI -> HuggingFace Space Deploy: ${HF_USER}/${SPACE_NAME}"

python3 -c "
from huggingface_hub import HfApi, create_repo
import os

api = HfApi(token=os.environ['HF_TOKEN'])
repo_id = '${HF_USER}/${SPACE_NAME}'

try:
    create_repo(repo_id, repo_type='space', space_sdk='docker', token=os.environ['HF_TOKEN'])
    print(f'Created Space: {repo_id}')
except Exception as e:
    if 'already exists' in str(e).lower():
        print(f'Space already exists: {repo_id}')
    else:
        raise

print('Uploading files...')
api.upload_folder(
    folder_id='.',
    repo_id=repo_id,
    repo_type='space',
    ignore_patterns=['.git/*', 'node_modules/*', 'dist/*', '.env', 'attached_assets/*', 'artifacts/mockup-sandbox/*'],
    token=os.environ['HF_TOKEN'],
)
print('Upload complete.')
"

echo "Your Space: https://huggingface.co/spaces/${HF_USER}/${SPACE_NAME}"
echo "Add secrets in Space Settings: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, OPENROUTER_API_KEY, NVIDIA_API_KEY, GITHUB_TOKEN"
