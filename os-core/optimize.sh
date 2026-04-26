#!/bin/bash
# Junction Core OS - Hardware Optimization
echo "performance" | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
# Prioritize NDI network interrupts to the high-performance cores
echo "f" > /proc/irq/$(grep eth0 /proc/interrupts | cut -d: -f1 | head -n1)/smp_affinity
echo "Junction Core: Performance Mode Active (24p Stability Optimized)"
