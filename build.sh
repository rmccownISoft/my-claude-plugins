#!/usr/bin/env bash
# build.sh — Package all skills from src/ into dist/
#
# Requires: Python 3, and the skill-creator skill installed (for package_skill.py)
# Usage: ./build.sh [skill-name]   # omit skill-name to build all

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$REPO_DIR/src"
DIST_DIR="$REPO_DIR/dist"

# ── Path to package_skill.py ────────────────────────────────────────────────
# This ships with the skill-creator skill. Update this path if yours differs.
PACKAGER="$HOME/.claude/skills/skill-creator/scripts/package_skill.py"

# Fallback: if skill-creator isn't installed, use a bundled copy
if [ ! -f "$PACKAGER" ]; then
  PACKAGER="$REPO_DIR/scripts/package_skill.py"
fi

if [ ! -f "$PACKAGER" ]; then
  echo "❌ Could not find package_skill.py"
  echo "   Either install the skill-creator skill, or copy package_skill.py into $REPO_DIR/scripts/"
  exit 1
fi

mkdir -p "$DIST_DIR"

build_skill() {
  local skill_dir="$1"
  local skill_name
  skill_name="$(basename "$skill_dir")"

  if [ ! -f "$skill_dir/SKILL.md" ]; then
    echo "⚠️  Skipping $skill_name — no SKILL.md found"
    return
  fi

  echo "📦 Building: $skill_name"
  python3 "$PACKAGER" "$skill_dir" "$DIST_DIR"
  echo "   ✅ dist/$skill_name.skill"
}

# Build a single skill or all skills
if [ $# -eq 1 ]; then
  target="$SRC_DIR/$1"
  if [ ! -d "$target" ]; then
    echo "❌ No skill found at: $target"
    exit 1
  fi
  build_skill "$target"
else
  echo "🔨 Building all skills..."
  echo ""
  for skill_dir in "$SRC_DIR"/*/; do
    build_skill "$skill_dir"
  done
fi

echo ""
echo "✅ Done. Packaged skills are in: $DIST_DIR"
