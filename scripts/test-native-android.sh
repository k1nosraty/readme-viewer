#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native-test-results dist
apk=$(find src-tauri/gen/android/app/build/outputs/apk -name '*debug*.apk' ! -name '*androidTest*' | sort | head -n 1)
test -n "$apk"
# Select a universal or x86_64 APK, never an arm-only split for this emulator.
for candidate in $(find src-tauri/gen/android/app/build/outputs/apk -name '*debug*.apk' ! -name '*androidTest*'); do
  if unzip -l "$candidate" | grep -q 'lib/x86_64/'; then apk="$candidate"; break; fi
done
unzip -l "$apk" | grep -q 'lib/x86_64/'
build_tools="$ANDROID_HOME/build-tools/35.0.0"
"$build_tools/apksigner" verify --verbose --print-certs "$apk" > native-test-results/android-signature.txt
package=$("$build_tools/aapt" dump badging "$apk" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
test -n "$package"
# New Tauri-generated output is the only accepted APK source.
unzip -l "$apk" | tee native-test-results/android-apk-files.txt | grep -E 'lib/(x86_64|arm64-v8a)/lib[^/]+\.so'
adb install -r "$apk"
trap 'adb shell am force-stop "$package"; adb uninstall "$package"' EXIT
adb logcat -c
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1
for attempt in $(seq 1 60); do
  if adb shell pidof "$package" > native-test-results/android-pid.txt; then break; fi
  sleep 1
done
test -s native-test-results/android-pid.txt
# Debug builds expose the embedded WebView DevTools socket. Fail if it never
# appears: a blank/failed native launch must not count as a successful smoke.
socket=""
for attempt in $(seq 1 60); do
  socket=$(adb shell cat /proc/net/unix | tr -d '\r' | awk '/webview_devtools_remote/ {sub(/^@/, "", $NF); print $NF; exit}')
  if test -n "$socket"; then break; fi
  sleep 1
done
test -n "$socket"
adb forward tcp:9222 "localabstract:$socket"
node scripts/native-android-webview-smoke.js
adb forward --remove tcp:9222
adb shell uiautomator dump /sdcard/native-window.xml
adb pull /sdcard/native-window.xml native-test-results/android-window.xml
grep -F "package=\"$package\"" native-test-results/android-window.xml
adb exec-out screencap -p > native-test-results/android-native.png
adb logcat -d > native-test-results/android-logcat.txt
if grep -E 'FATAL EXCEPTION|Fatal signal' native-test-results/android-logcat.txt; then exit 1; fi
version=$(node -p "require('./package.json').version")
output="README-Viewer-$version-Android-Debug-Preview.apk"
cp "$apk" "dist/$output"
(cd dist && sha256sum "$output" > "$output.sha256")
echo 'Native Android debug preview signature, launch, UI surface, screenshot and uninstall smoke passed.'
