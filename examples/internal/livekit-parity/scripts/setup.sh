#!/usr/bin/env bash
# Vendors the upstream LiveKit agents-ui visualizer sources and copies the
# local voice fixture. Both land in GITIGNORED locations (src/vendor/,
# public/voice.wav) and must stay out of git:
#
#   - agent-audio-visualizer-aura.tsx is Polyform Non-Resale 1.0.0
#     (c) UNCRN LLC (Unicorn Studio) -- NOT open source. It may be run
#     locally for black-box visual comparison only. Never commit it, never
#     copy from it.
#   - Everything else fetched here is Apache-2.0 (livekit/components-js) or
#     MIT (react-shader-toy.tsx).
#   - voice.wav is a private recording of the project owner's voice.
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${LIVEKIT_REF:-main}"
BASE="https://raw.githubusercontent.com/livekit/components-js/${REF}/packages/shadcn"

mkdir -p src/vendor/components/agents-ui src/vendor/hooks/agents-ui public

echo "Fetching livekit/components-js@${REF} packages/shadcn agents-ui sources..."
for c in bar grid radial wave aura; do
  curl -fsSL "$BASE/components/agents-ui/agent-audio-visualizer-$c.tsx" \
    -o "src/vendor/components/agents-ui/agent-audio-visualizer-$c.tsx"
  curl -fsSL "$BASE/hooks/agents-ui/use-agent-audio-visualizer-$c.ts" \
    -o "src/vendor/hooks/agents-ui/use-agent-audio-visualizer-$c.ts"
  echo "  agent-audio-visualizer-$c"
done
curl -fsSL "$BASE/components/agents-ui/react-shader-toy.tsx" \
  -o src/vendor/components/agents-ui/react-shader-toy.tsx
echo "  react-shader-toy"

VOICE_SRC="${VOICE_SRC:-$HOME/Projects/kitn-ai/audio-visualizers-artifacts/voice.wav}"
if [ -f "$VOICE_SRC" ]; then
  cp "$VOICE_SRC" public/voice.wav
  echo "Copied voice fixture -> public/voice.wav"
else
  echo "WARN: $VOICE_SRC not found. RECORDING mode will 404; FIXTURE and MIC still work."
fi

echo
echo "Done. REMINDER: src/vendor/ and public/voice.wav are gitignored on purpose;"
echo "the aura component is Polyform-licensed and must never be committed."
