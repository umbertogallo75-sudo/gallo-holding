#!/bin/sh
#
# The build number, decided by the build.
#
# Xcode Cloud does not set it for you: it archives whatever number is written
# in the project, so every automated build after the first tries to upload the
# same one and App Store Connect refuses it — always at the very last step,
# "Prepare Build for App Store Connect", with everything else green.
#
# This script must never be the reason a build fails. Its job is a nicety: if
# it cannot find what it needs, the build should go on and be rejected for the
# real reason, not stopped here by a missing variable. So every path ends in
# exit 0, and what happened is said out loud in the log instead.
#
# The marketing version — the 1.3 people see — is deliberately left alone:
# that one is a decision, not bookkeeping.

say() { echo "[build-number] $*"; }

if [ -z "${CI_BUILD_NUMBER:-}" ]; then
  say "CI_BUILD_NUMBER non impostato: lascio il progetto com'è."
  exit 0
fi

# Xcode Cloud exports the checkout path, but not always under the name the
# documentation uses, so the script's own location is the reliable fallback:
# it lives beside the project it has to edit.
here=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)
for candidate in \
  "${CI_PRIMARY_REPOSITORY_PATH:-}/ios/ExecLingo/ExecLingo.xcodeproj/project.pbxproj" \
  "${CI_WORKSPACE:-}/ios/ExecLingo/ExecLingo.xcodeproj/project.pbxproj" \
  "${here}/ExecLingo.xcodeproj/project.pbxproj"
do
  [ -f "$candidate" ] && project="$candidate" && break
done

if [ -z "${project:-}" ]; then
  say "progetto non trovato: lascio il numero di build com'è."
  exit 0
fi

if /usr/bin/sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" "$project"; then
  say "numero di build → ${CI_BUILD_NUMBER} in ${project}"
  grep -m1 "CURRENT_PROJECT_VERSION" "$project" || true
else
  say "non sono riuscito a scrivere nel progetto: proseguo comunque."
fi
exit 0
