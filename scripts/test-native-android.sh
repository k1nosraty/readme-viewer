#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native-test-results dist
apk=$(find src-tauri/gen/android/app/build/outputs/apk -name '*debug*.apk' ! -name '*androidTest*' | sort | head -n 1)
test -n "$apk"
# Select a universal or x86_64 APK, never an arm-only split for this emulator.
for candidate in $(find src-tauri/gen/android/app/build/outputs/apk -name '*debug*.apk' ! -name '*androidTest*'); do
  if unzip -l "$candidate" | grep 'lib/x86_64/' > /dev/null; then apk="$candidate"; break; fi
done
unzip -l "$apk" | grep 'lib/x86_64/' > /dev/null
build_tools="$ANDROID_HOME/build-tools/35.0.0"
"$build_tools/apksigner" verify --verbose --print-certs "$apk" > native-test-results/android-signature.txt
package=$("$build_tools/aapt" dump badging "$apk" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
test -n "$package"
package_metadata=$("$build_tools/aapt" dump badging "$apk" | sed -n '/^package: /p')
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
  socket=$(adb shell cat /proc/net/unix | tr -d '\r' | awk '/webview_devtools_remote/ && !found {sub(/^@/, "", $NF); print $NF; found=1}')
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
# Prefer a single universal APK. If Gradle emits ABI splits, label them so an
# emulator-only X86_64 build can never be mistaken for a phone ARM64 preview.
package_apk() {
  local source="$1" architecture="$2"
  local output="README-Viewer-$version-Android-$architecture-Debug-Preview.apk"
  "$build_tools/apksigner" verify "$source"
  local metadata
  metadata=$("$build_tools/aapt" dump badging "$source" | sed -n '/^package: /p')
  # Every distributed ABI must identify the exact same app/version as the APK
  # exercised by the emulator, rather than an unrelated stale build output.
  test "$metadata" = "$package_metadata"
  cp "$source" "dist/$output"
  (cd dist && sha256sum "$output" > "$output.sha256")
}
if unzip -l "$apk" | grep 'lib/arm64-v8a/' > /dev/null; then
  package_apk "$apk" Universal
else
  package_apk "$apk" X86_64
  arm_apk=""
  while IFS= read -r candidate; do
    if unzip -l "$candidate" | grep 'lib/arm64-v8a/' > /dev/null; then arm_apk="$candidate"; break; fi
  done < <(find src-tauri/gen/android/app/build/outputs/apk -name '*debug*.apk' ! -name '*androidTest*')
  test -n "$arm_apk"
  package_apk "$arm_apk" ARM64
fi
echo 'Native Android debug preview signature, launch, WebView editing, screenshot and uninstall smoke passed.'
