# Junction Core OS vs Blackmagic Systems

Combined technical and executive report for comparison, decision scoring, and board-level approval.

---

## 1) Executive Summary

Junction Core OS is now strong enough to replace Blackmagic-style appliance workflows in many controlled deployments, especially where software-defined flexibility, lower long-term cost, and multi-vendor extensibility matter.

Blackmagic still has an advantage in immediate operator familiarity and mature fixed-vendor timing expectations out-of-box.  
Junction’s remaining high-priority gap is timing-grade validation and repeatable field reliability hardening.

**Recommended decision:** proceed with a phased Junction rollout while keeping fallback paths until rehearsal KPIs are consistently met.

---

## 2) System Scope Snapshot (Current Repository)

### Implemented Core Areas

- Vision switcher control plane (WebSocket + REST)
- Production dashboard (switcher, multiview, camera control, readiness, NOC, MCR, rack UIs)
- ISO recorder service (health, start/stop, disk preflight, profile support, primary/backup orchestration)
- Node-agent telemetry + command queue orchestration
- GPU module policy (plug-and-play, NVIDIA/L4-aware)
- Overlay/graphics module policy plane
- Secure remote access controls (CIDR + optional remote code)
- Multi-dashboard realtime sync (SSE)
- Warm standby runbook + data sync script
- Operator profile modes:
  - `single_vendor_operator`
  - `multi_vendor_software_defined`

### Architecture Planes

| Plane | Responsibility |
| :--- | :--- |
| Control | Routing, presets, operator UX, audit/observability |
| Media / ISO / GPU | Recording, media acceleration policy, disk/path controls |
| Graphics / Overlay | Orange Pi-oriented graphics module lifecycle |
| Site / Cluster | Node telemetry, command orchestration, remote policy, readiness |

---

## 3) Capability-by-Capability Comparison

| Capability | Junction Status | Relative Position |
| :--- | :--- | :--- |
| Live switching control | Implemented | Competitive |
| Multiview | Implemented | Competitive |
| Camera control | Implemented | Competitive |
| ISO recording primary/backup | Implemented | Strong |
| GPU acceleration policy | Implemented (evolving) | Junction advantage |
| Overlay module plane | Implemented (evolving) | Junction advantage |
| Multi-operator realtime sync | Implemented | Junction advantage |
| Secure remote operations | Implemented | Junction advantage |
| Warm standby control strategy | Implemented | Junction advantage |
| Timing-grade sync parity | Partial roadmap | Blackmagic advantage today |

---

## 4) Strategic Side-by-Side

| Dimension | Junction Core OS | Blackmagic Systems | Advantage |
| :--- | :--- | :--- | :--- |
| CapEx flexibility | High (commodity hardware) | Medium (appliance-centric) | Junction |
| Workflow customization | Very high | Medium | Junction |
| Operator familiarity day-1 | Medium | High | Blackmagic |
| Multi-vendor future-proofing | Very high | Lower | Junction |
| Time-to-first-simple-show | Medium | High | Blackmagic |
| Cloud/VPS supervisory patterns | High | Lower | Junction |
| Long-term extensibility | Very high | Medium | Junction |

---

## 5) Weighted Decision Score Model

Scoring scale: 1 to 10 per criterion. Weighted total out of 100.

| Criterion | Weight | Junction | Blackmagic | Junction Weighted | Blackmagic Weighted |
| :--- | ---: | ---: | ---: | ---: | ---: |
| CapEx + scaling flexibility | 20% | 9 | 7 | 18.0 | 14.0 |
| Operational reliability (current) | 20% | 7 | 8 | 14.0 | 16.0 |
| Customization + integration freedom | 15% | 10 | 6 | 15.0 | 9.0 |
| Operator onboarding speed | 10% | 7 | 9 | 7.0 | 9.0 |
| Redundancy architecture flexibility | 10% | 9 | 7 | 9.0 | 7.0 |
| Remote + multi-operator orchestration | 10% | 9 | 7 | 9.0 | 7.0 |
| Timing / broadcast sync parity | 10% | 6 | 8 | 6.0 | 8.0 |
| Long-term extensibility | 5% | 10 | 6 | 5.0 | 3.0 |
| **Total** | **100%** |  |  | **83.0** | **73.0** |

**Model outcome:** Junction leads overall in this weighting model (+10).  
**Sensitivity note:** If timing and immediate reliability are weighted much higher, Blackmagic closes the gap.

---

## 6) Risk Register and Mitigation

| Risk Area | Current Concern | Recommended Action |
| :--- | :--- | :--- |
| Timing / sync parity | Need broadcast-grade proof under stress | Add timing conformance rehearsal gates |
| Operator transition | Feature richness can increase cognitive load | Use profile modes + checklist gating |
| Hardware variability | Commodity hardware can vary | Approved BOM + burn-in acceptance |
| Monitoring depth | Need stronger quality telemetry in scale | Expand MCR SLA metrics and alerting |

---

## 7) Rollout Plan

| Phase | Timeline | Priority Work | Expected Outcome |
| :--- | :--- | :--- | :--- |
| Phase 1 | 0-30 days | Lock UX, role profiles, runbooks, controlled rehearsals | Stable controlled operations |
| Phase 2 | 30-90 days | Timing hardening, soak tests, standard node images | Broadcast confidence uplift |
| Phase 3 | 90-180 days | Automated failover and richer MCR analytics | Enterprise-grade readiness |

---

## 8) Budget Bands (Relative)

| Deployment Tier | Relative Budget | Scope |
| :--- | :--- | :--- |
| Pilot (3-cam) | Low-Mid | Core control + recording + baseline monitoring |
| Production (6-10 cam) | Mid | Dual-control readiness + GPU/overlay expansion |
| Multi-site enterprise | Mid-High | Standardization, advanced failover, full observability |

---

## 9) Governance and KPIs

### Governance Controls

- Phase-gate sign-off: engineering, operations, and rehearsal readiness
- Mandatory audit + observability for control mutations
- Role-based operator profile enforcement for show types

### KPI Targets

| KPI | Target |
| :--- | :--- |
| Control-plane recovery objective | < 2 minutes |
| Dropped frame rate in rehearsal | < 0.1% |
| Operator error incidents | Reduce by 30-50% |
| Critical alert acknowledgment | < 60 seconds |

---

## 10) Final Recommendation

Adopt **Junction Core OS** as the strategic broadcast platform with phased deployment and KPI gates.  
Keep fallback options during transition while timing-grade and large-event rehearsal metrics are hardened.

This path captures Junction’s software-defined advantages now while controlling broadcast risk during migration.

