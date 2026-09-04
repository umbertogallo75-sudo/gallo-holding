#!/bin/sh
#
# The build number, decided by the build.
#
# Xcode Cloud does not set it for you: it archives whatever number is written
# in the project, so every automated build after the first tries to upload the
# same one and App Store Connect refuses it — always at the very last step,
# "Prepare Build for App Store Connect", with everything else green. The build
# number is exactly the kind of thing nobody should be editing by hand before
# every release, so it is taken from the run instead. It only ever goes up.
#
# The marketing version — the 1.3 people see — is deliberately left alone: that
# one is a decision, not bookkeeping.
set -eu

: "${CI_BUILD_NUMBER:?not running inside Xcode Cloud}"
project="${CI_PRIMARY_REPOSITORY_PATH}/ios/ExecLingo/ExecLingo.xcodeproj/project.pbxproj"
[ -f "$project" ] || { echo "no project at $project"; exit 1; }

# Written straight into the project rather than through agvtool, which needs a
# versioning system this target does not use and an Info.plist it does not have.
/usr/bin/sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${CI_BUILD_NUMBER};/g" "$project"
echo "build number → ${CI_BUILD_NUMBER}"
grep -m1 "CURRENT_PROJECT_VERSION" "$project"
