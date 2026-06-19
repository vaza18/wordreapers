# Shared helpers for scripts/run-ios.sh (sourced, not executed).

metro_ready() {
  curl -sf "http://127.0.0.1:8081/status" >/dev/null 2>&1
}

ensure_metro() {
  local device_udid="${1:-}"
  local metro_args=(start --dev-client --port 8081)

  if [ -z "$device_udid" ]; then
    metro_args+=(--localhost)
  fi

  if metro_ready; then
    return 0
  fi

  echo "Metro is not running on http://127.0.0.1:8081"
  echo "Starting Metro in the background (logs: /tmp/wordreapers-metro.log)…"
  nohup npx expo "${metro_args[@]}" > /tmp/wordreapers-metro.log 2>&1 &
  disown || true
  for _ in $(seq 1 45); do
    if metro_ready; then
      return 0
    fi
    sleep 1
  done

  echo "Metro failed to start. Run manually in another terminal:"
  echo "  npm start"
  exit 1
}

detect_lan_ip() {
  local iface ip
  for iface in en0 en1 bridge0; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

configure_packager_hostname() {
  local root="$1"
  local ip="$2"
  local local_file="$root/ios/.xcode.env.local"
  local tmp

  if [ -z "$ip" ]; then
    return 1
  fi

  tmp="$(mktemp)"
  if [ -f "$local_file" ]; then
    grep -v 'REACT_NATIVE_PACKAGER_HOSTNAME' "$local_file" >"$tmp" || true
  fi
  echo "export REACT_NATIVE_PACKAGER_HOSTNAME=$ip" >>"$tmp"
  mv "$tmp" "$local_file"
  export REACT_NATIVE_PACKAGER_HOSTNAME="$ip"
}

find_built_ios_app() {
  ls -td "$HOME"/Library/Developer/Xcode/DerivedData/Slovozbirachi-*/Build/Products/Debug-iphoneos/Slovozbirachi.app 2>/dev/null | head -1
}

list_xctrace_physical_devices() {
  xcrun xctrace list devices 2>/dev/null | awk '
    /^== Devices ==$/ { section="devices"; next }
    /^== Devices Offline ==$/ { section="offline"; next }
    /^== Simulators ==$/ { section="sim"; next }
    section == "devices" || section == "offline" {
      if ($0 ~ /\([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\)$/) {
        print $0
      }
    }
  '
}

list_online_physical_devices() {
  xcrun xctrace list devices 2>/dev/null | awk '
    /^== Devices ==$/ { section="devices"; next }
    /^== Devices Offline ==$/ { section="offline"; next }
    /^== Simulators ==$/ { section="sim"; next }
    section == "devices" {
      if ($0 ~ /\([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\)$/) {
        print $0
      }
    }
  '
}

resolve_expo_device_udid() {
  local requested="${1:-}"
  local line udid name

  if [ -z "$requested" ]; then
    return 1
  fi

  if [[ "$requested" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$ ]]; then
    echo "$requested"
    return 0
  fi

  while IFS= read -r line; do
    name="${line%% (*}"
    udid="${line##*(}"
    udid="${udid%)}"
    if [ "$name" = "$requested" ]; then
      echo "$udid"
      return 0
    fi
  done < <(list_xctrace_physical_devices)

  return 1
}

resolve_online_physical_device_udid() {
  local line udid count=0 last=""
  while IFS= read -r line; do
    udid="${line##*(}"
    udid="${udid%)}"
    last="$udid"
    count=$((count + 1))
  done < <(list_online_physical_devices)

  if [ "$count" -eq 1 ]; then
    echo "$last"
    return 0
  fi
  return 1
}

patch_ios_embed_bundle_on_device() {
  local root="$1"
  local pbxproj="$root/ios/Slovozbirachi.xcodeproj/project.pbxproj"
  if [ ! -f "$pbxproj" ]; then
    return 0
  fi
  node --input-type=module -e "
    import fs from 'node:fs';
    import { patchPbxprojSkipBundling } from './plugins/with-ios-device-metro-host.cjs';
    const path = '$pbxproj';
    const before = fs.readFileSync(path, 'utf8');
    const after = patchPbxprojSkipBundling(before);
    if (after !== before) fs.writeFileSync(path, after);
  "
}

patch_ios_metro_host() {
  local root="$1"
  local ip="$2"
  local app_delegate="$root/ios/Slovozbirachi/AppDelegate.swift"
  local info_plist="$root/ios/Slovozbirachi/Info.plist"

  if [ -z "$ip" ] || [ ! -f "$app_delegate" ] || [ ! -f "$info_plist" ]; then
    return 0
  fi

  /usr/libexec/PlistBuddy -c "Delete :EXMetroHost" "$info_plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :EXMetroHost string $ip" "$info_plist"

  if ! grep -q 'isPackagerRunning' "$app_delegate"; then
    node --input-type=module -e "
      import fs from 'node:fs';
      import { patchAppDelegate, DEFAULT_BUNDLE_URL, DEVICE_BUNDLE_URL } from './plugins/with-ios-device-metro-host.cjs';
      const path = '$app_delegate';
      const before = fs.readFileSync(path, 'utf8');
      const after = patchAppDelegate(before);
      if (after === before && before.includes('override func bundleURL')) {
        fs.writeFileSync(path, before.replace(DEFAULT_BUNDLE_URL, DEVICE_BUNDLE_URL));
      } else if (after !== before) {
        fs.writeFileSync(path, after);
      }
    "
  fi
}

strip_ios_push_entitlement_if_needed() {
  local root="$1"
  if [ "${EXPO_IOS_ENABLE_PUSH:-}" = "1" ]; then
    return 0
  fi
  local entitlements="$root/ios/Slovozbirachi/Slovozbirachi.entitlements"
  if [ -f "$entitlements" ]; then
    /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$entitlements" 2>/dev/null || true
  fi
}

apply_ios_native_patches() {
  local root="$1"
  strip_ios_push_entitlement_if_needed "$root"
  patch_ios_embed_bundle_on_device "$root"
  local ip=""
  if ip="$(detect_lan_ip)"; then
    configure_packager_hostname "$root" "$ip"
    patch_ios_metro_host "$root" "$ip"
  fi
}

apply_ios_simulator_patches() {
  local root="$1"
  local local_file="$root/ios/.xcode.env.local"

  strip_ios_push_entitlement_if_needed "$root"
  patch_ios_embed_bundle_on_device "$root"

  if [ -f "$local_file" ]; then
    grep -v 'REACT_NATIVE_PACKAGER_HOSTNAME' "$local_file" >"${local_file}.tmp" || true
    mv "${local_file}.tmp" "$local_file"
  fi
  unset REACT_NATIVE_PACKAGER_HOSTNAME
}

embed_js_bundle_into_app() {
  local root="$1"
  local app_path="$2"
  local entry_file

  if [ -z "$app_path" ] || [ ! -d "$app_path" ]; then
    echo "Could not find Slovozbirachi.app to embed JS bundle."
    return 1
  fi

  # shellcheck disable=SC1091
  source "$root/ios/.xcode.env"
  # shellcheck disable=SC1091
  [ -f "$root/ios/.xcode.env.local" ] && source "$root/ios/.xcode.env.local"

  entry_file="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$root" ios absolute | tail -n 1)"

  echo "Embedding fresh JS bundle into app (expo export:embed)…"
  npx expo export:embed \
    --entry-file "$entry_file" \
    --platform ios \
    --dev false \
    --bundle-output "$app_path/main.jsbundle" \
    --assets-dest "$app_path"

  if [ ! -f "$app_path/main.jsbundle" ]; then
    echo "Failed to create main.jsbundle in app package."
    return 1
  fi

  echo "Embedded $(du -h "$app_path/main.jsbundle" | awk '{print $1}') main.jsbundle"
}

print_physical_post_install_steps() {
  local ip="$1"
  echo ""
  echo "Installed Slovozbirachi (Debug-iphoneos) with embedded JS bundle."
  echo ""
  echo "Open Slovozbirachi on the iPhone — embedded JS runs offline (no Metro required)."
  echo ""
  echo "For live dev / hot reload (optional, needs Metro):"
  echo "  1. Keep Metro running (npm start, or npm run start:tunnel)."
  if [ -n "$ip" ]; then
    echo "  2. Same Wi-Fi: phone loads Metro from http://${ip}:8081 when reachable."
  fi
  echo "  3. Metro shows \"iOS Bundled\" when live reload is active."
  echo ""
}

app_mtime_epoch() {
  local path="$1"
  stat -f %m "$path" 2>/dev/null || stat -c %Y "$path"
}

finalize_physical_ios_app_if_built() {
  local root="$1"
  local device_udid="${2:-}"
  local build_started_at="${3:-0}"
  local app_path lan_ip app_mtime

  app_path="$(find_built_ios_app)"
  if [ -z "$app_path" ]; then
    return 0
  fi

  if [ "$build_started_at" -gt 0 ]; then
    app_mtime="$(app_mtime_epoch "$app_path")"
    if [ -n "$app_mtime" ] && [ "$app_mtime" -lt "$build_started_at" ]; then
      return 0
    fi
  fi

  if ! embed_js_bundle_into_app "$root" "$app_path"; then
    return 1
  fi

  if [ -z "$device_udid" ]; then
    device_udid="$(resolve_online_physical_device_udid || true)"
  fi
  if [ -z "$device_udid" ]; then
    echo "Embedded bundle in .app; reconnect one iPhone via USB and run:"
    echo "  npm run ios:device <name-or-udid>"
    return 0
  fi

  echo "Reinstalling app with embedded JS bundle…"
  npx expo run:ios --device "$device_udid" --no-bundler --binary "$app_path"
  lan_ip="$(detect_lan_ip || true)"
  print_physical_post_install_steps "$lan_ip"
}
