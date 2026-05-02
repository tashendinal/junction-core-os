#!/usr/bin/env bash
# Junction Core OS — performance tuning + optional thermal watchdog (rack fans + dashboard alert).
#
# One-shot (default):
#   sudo ./optimize.sh
#
# Thermal watchdog loop (GPIO fans + UDP → Vision → WebSocket "High Temp"):
#   sudo ./optimize.sh thermal-watchdog
#   # or: sudo JUNCTION_THERMAL_WATCHDOG=1 ./optimize.sh
#
# Environment (watchdog):
#   JUNCTION_TEMP_HIGH_C       trip threshold °C (default 75)
#   JUNCTION_TEMP_LOW_C        hysteresis clear fans / alert °C (default 68)
#   JUNCTION_THERMAL_INTERVAL  poll seconds (default 2)
#   JUNCTION_FAN_GPIO          sysfs GPIO number for rack fan relay (see gpioinfo / board docs)
#   JUNCTION_FAN_ACTIVE_HIGH   1 = active high fan drive (default 1)
#   JUNCTION_VISION_HOST       Vision / thermal UDP host (default 127.0.0.1)
#   JUNCTION_THERMAL_ALERT_UDP_PORT  must match Vision (default 47779)
#
set -euo pipefail

JUNCTION_TEMP_HIGH_C="${JUNCTION_TEMP_HIGH_C:-75}"
JUNCTION_TEMP_LOW_C="${JUNCTION_TEMP_LOW_C:-68}"
JUNCTION_THERMAL_INTERVAL="${JUNCTION_THERMAL_INTERVAL:-2}"
JUNCTION_FAN_ACTIVE_HIGH="${JUNCTION_FAN_ACTIVE_HIGH:-1}"
JUNCTION_VISION_HOST="${JUNCTION_VISION_HOST:-127.0.0.1}"
JUNCTION_THERMAL_ALERT_UDP_PORT="${JUNCTION_THERMAL_ALERT_UDP_PORT:-47779}"

apply_performance() {
  echo "performance" | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor 2>/dev/null || true
  if grep -q eth0 /proc/interrupts 2>/dev/null; then
    irq=$(grep eth0 /proc/interrupts | cut -d: -f1 | head -n1 | tr -d ' ')
    if [[ -n "$irq" ]] && [[ -f "/proc/irq/${irq}/smp_affinity" ]]; then
      echo "f" > "/proc/irq/${irq}/smp_affinity" 2>/dev/null || true
    fi
  fi
  echo "Junction Core: Performance Mode Active (24p Stability Optimized)"
}

# Max °C across thermal zones + hwmon sensors (covers SoC + per-cluster readings on many ARM boards).
max_temp_c() {
  local max=0 raw c path
  shopt -s nullglob
  for path in /sys/class/thermal/thermal_zone*/temp; do
    [[ -f "$path" ]] || continue
    raw=$(tr -d '[:space:]' <"$path" 2>/dev/null || echo 0)
    [[ "$raw" =~ ^[0-9]+$ ]] || continue
    if [[ "$raw" -gt 1000 ]]; then c=$((raw / 1000)); else c=$raw; fi
    [[ "$c" -gt "$max" ]] && max=$c
  done
  for path in /sys/class/hwmon/hwmon*/temp*_input; do
    [[ "$path" == *"_label" ]] && continue
    [[ -f "$path" ]] || continue
    raw=$(tr -d '[:space:]' <"$path" 2>/dev/null || echo 0)
    [[ "$raw" =~ ^[0-9]+$ ]] || continue
    if [[ "$raw" -gt 1000 ]]; then c=$((raw / 1000)); else c=$raw; fi
    [[ "$c" -gt "$max" ]] && max=$c
  done
  shopt -u nullglob
  echo "$max"
}

fan_gpio_value() {
  local want=$1
  local val
  if [[ "${JUNCTION_FAN_ACTIVE_HIGH:-1}" == "1" ]]; then
    val=$want
  else
    val=$((1 - want))
  fi
  echo "$val"
}

fan_set() {
  local on=$1
  local val
  val=$(fan_gpio_value "$on")

  if [[ -n "${JUNCTION_FAN_GPIO:-}" ]]; then
    local pin="${JUNCTION_FAN_GPIO}"
    if [[ ! -d "/sys/class/gpio/gpio${pin}" ]]; then
      echo "$pin" > /sys/class/gpio/export 2>/dev/null || true
      sleep 0.1
    fi
    if [[ -d "/sys/class/gpio/gpio${pin}" ]]; then
      echo out > "/sys/class/gpio/gpio${pin}/direction" 2>/dev/null || true
      echo "$val" > "/sys/class/gpio/gpio${pin}/value" 2>/dev/null || true
      return 0
    fi
  fi

  [[ "$on" == 1 ]] && echo "[thermal-watchdog] WARNING: no fan GPIO configured (set JUNCTION_FAN_GPIO or JUNCTION_FAN_GPIO_CHIP/LINE)" >&2
  return 0
}

send_thermal_udp() {
  local json=$1
  if command -v nc >/dev/null 2>&1; then
    printf '%s' "$json" | nc -u -w1 -W1 "$JUNCTION_VISION_HOST" "$JUNCTION_THERMAL_ALERT_UDP_PORT" 2>/dev/null && return 0
  fi
  # Bash /dev/udp (Linux)
  exec 3<>/dev/udp/"$JUNCTION_VISION_HOST"/"$JUNCTION_THERMAL_ALERT_UDP_PORT" 2>/dev/null || return 1
  printf '%s' "$json" >&3
  exec 3>&-
}

thermal_watchdog_loop() {
  apply_performance
  echo "[thermal-watchdog] high=${JUNCTION_TEMP_HIGH_C}°C low=${JUNCTION_TEMP_LOW_C}°C interval=${JUNCTION_THERMAL_INTERVAL}s vision=${JUNCTION_VISION_HOST}:${JUNCTION_THERMAL_ALERT_UDP_PORT}"

  local alert_active=0 t
  while true; do
    t=$(max_temp_c)
    if [[ "$t" -ge "$JUNCTION_TEMP_HIGH_C" ]]; then
      fan_set 1
      if [[ "$alert_active" -eq 0 ]]; then
        send_thermal_udp "$(printf '{"type":"thermal_alert","level":"high","max_c":%s,"message":"High Temp — rack external fans ON","fans":"on"}' "$t")" || true
        alert_active=1
      fi
    elif [[ "$t" -le "$JUNCTION_TEMP_LOW_C" ]]; then
      fan_set 0
      if [[ "$alert_active" -eq 1 ]]; then
        send_thermal_udp '{"type":"thermal_clear","message":"Thermal nominal"}' || true
        alert_active=0
      fi
    fi
    sleep "$JUNCTION_THERMAL_INTERVAL"
  done
}

if [[ "${1:-}" == "thermal-watchdog" ]] || [[ "${JUNCTION_THERMAL_WATCHDOG:-}" == "1" ]]; then
  thermal_watchdog_loop
else
  apply_performance
fi
