# Node-agent GPU heartbeat schema (small, plug-and-play)

Use this schema in node-agent payloads sent to dashboard `POST /api/node-metrics`.

This is additive: nodes without GPUs can omit `gpus`.

```json
{
  "nodeId": "n07",
  "ip": "10.0.0.17",
  "role": "GPU Media",
  "hwId": "HW-X86-L4-2201",
  "thermalC": 63,
  "cpuPct": 48,
  "memoryPct": 57,
  "diskPct": 42,
  "networkRxMbps": 310,
  "networkTxMbps": 266,
  "gpus": [
    {
      "vendor": "NVIDIA",
      "model": "NVIDIA L4",
      "vramGb": 24,
      "pcieSlot": "slot-1",
      "driverVersion": "550.x",
      "cudaVersion": "12.4",
      "powerLimitW": 72,
      "state": "online"
    }
  ]
}
```

## Notes

- `gpus[]` can contain one or many cards.
- Dashboard auto-enrollment can import these cards into `gpu-modules.json`.
- Recommended `state` values: `online`, `offline`, `maintenance`.
- Keep heartbeat cadence aligned with existing node metrics (e.g. 2-5 seconds in live mode).
