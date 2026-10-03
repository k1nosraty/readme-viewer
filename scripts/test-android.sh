#!/bin/sh
set -eu
if ! gradle -p android :app:connectedDebugAndroidTest; then
  find android/app/build/outputs/androidTest-results -name '*.xml' -exec cat {} \;
  exit 1
fi
