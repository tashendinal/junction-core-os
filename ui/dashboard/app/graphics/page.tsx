"use client";

import { TopNav } from "../components/TopNav";
import { useCallback, useEffect, useState } from "react";
import type { GraphicsBusState, GraphicsMediaSlots } from "../../lib/graphicsTypes";

type Layers = GraphicsBusState["layers"];

type ScenePreset = { id: string; label: string };

type GraphicsDoc = {
  updatedAt: string;
  targetModuleId: string | null;
  notes: string;
  scenePresets: ScenePreset[];
  preview: GraphicsBusState;
  program: GraphicsBusState;
  canWrite?: boolean;
};

type AssetRow = {
  id: string;
  url: string;
  kind: "image" | "video";
  originalName: string;
};

const LAYER_KEYS: Array<{ key: keyof Layers; label: string }> = [
  { key: "lowerThird", label: "Lower third" },
  { key: "crawl", label: "Crawl" },
  { key: "logo", label: "Logo" },
  { key: "fullscreen", label: "Fullscreen" },
];

function looksLikeVideoUrl(u: string): boolean {
  const s = u.split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(s);
}

function assetKindForId(assets: AssetRow[], id: string | null): "image" | "video" | null {
  if (!id) return null;
  return assets.find((a) => a.id === id)?.kind ?? null;
}

function resolveSrc(assetId: string | null, urlField: string, assets: AssetRow[]): string | null {
  if (assetId) {
    const a = assets.find((x) => x.id === assetId);
    if (a) return a.url;
  }
  const u = urlField.trim();
  if (!u) return null;
  return u;
}

function MediaMonitor(props: {
  label: string;
  variant: "pvw" | "pgm";
  bus: GraphicsBusState;
  assets: AssetRow[];
}) {
  const { label, variant, bus, assets } = props;
  const ring = variant === "pgm" ? "gfx-monitor--pgm" : "gfx-monitor--pvw";

  const bg = resolveSrc(bus.media.backgroundAssetId, bus.media.backgroundUrl, assets);
  const ov = resolveSrc(bus.media.overlayAssetId, bus.media.overlayUrl, assets);
  const logo = resolveSrc(bus.media.logoAssetId, bus.media.logoUrl, assets);

  const bgKind = assetKindForId(assets, bus.media.backgroundAssetId);
  const bgIsVideo = bgKind === "video" || (bg && looksLikeVideoUrl(bg));
  const ovKind = assetKindForId(assets, bus.media.overlayAssetId);
  const ovIsVideo = ovKind === "video" || (ov && looksLikeVideoUrl(ov));

  return (
    <div className={`gfx-monitor tactile-node ${ring}`}>
      <div className="gfx-monitor__chrome">
        <span className="technical-label">{label}</span>
      </div>
      <div className="gfx-monitor__canvas">
        {!bg ? (
          <div className="gfx-monitor__empty">No background — pick an upload or paste a URL.</div>
        ) : bgIsVideo ? (
          <video className="gfx-monitor__bg" src={bg} muted playsInline loop autoPlay controls={false} />
        ) : (
          <img className="gfx-monitor__bg" src={bg} alt="" />
        )}

        {ov ? (
          ovIsVideo ? (
            <video className="gfx-monitor__overlay" src={ov} muted playsInline loop autoPlay />
          ) : (
            <img className="gfx-monitor__overlay" src={ov} alt="" />
          )
        ) : null}

        {logo ? <img className="gfx-monitor__logo" src={logo} alt="" /> : null}

        <div className="gfx-monitor__safe">
          {bus.primaryLine ? <div className="gfx-monitor__t1">{bus.primaryLine}</div> : null}
          {bus.secondaryLine ? <div className="gfx-monitor__t2">{bus.secondaryLine}</div> : null}
          {bus.crawl ? <div className="gfx-monitor__crawl">{bus.crawl}</div> : null}
        </div>
      </div>
    </div>
  );
}

function MediaSlotRow(props: {
  label: string;
  assets: AssetRow[];
  assetId: string | null;
  urlField: string;
  readOnly: boolean;
  filter?: "all" | "image" | "video";
  onAssetId: (id: string | null) => void;
  onUrl: (v: string) => void;
}) {
  const { label, assets, assetId, urlField, readOnly, filter = "all", onAssetId, onUrl } = props;
  const list =
    filter === "all"
      ? assets
      : assets.filter((a) => (filter === "image" ? a.kind === "image" : a.kind === "video"));

  return (
    <div className="gfx-media-slot">
      <span className="technical-label">{label}</span>
      <div className="gfx-media-slot__row">
        <select
          className="gfx-input"
          disabled={readOnly}
          value={assetId ?? ""}
          onChange={(e) => onAssetId(e.target.value || null)}
        >
          <option value="">— library —</option>
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.originalName.slice(0, 48)} ({a.kind})
            </option>
          ))}
        </select>
        <input
          className="gfx-input gfx-media-slot__url"
          disabled={readOnly}
          value={urlField}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="Or https://… or /junction-graphics/…"
        />
      </div>
    </div>
  );
}

function BusPanel(props: {
  title: string;
  subtitle: string;
  variant: "preview" | "program";
  bus: GraphicsBusState;
  presets: ScenePreset[];
  assets: AssetRow[];
  onChange: (next: GraphicsBusState) => void;
  readOnly?: boolean;
}) {
  const { title, subtitle, variant, bus, presets, assets, onChange, readOnly } = props;
  const ring = variant === "preview" ? "gfx-bus--pvw" : "gfx-bus--pgm";

  const setLayer = (key: keyof Layers, v: boolean) => {
    if (readOnly) return;
    onChange({
      ...bus,
      layers: { ...bus.layers, [key]: v },
    });
  };

  const patchMedia = (p: Partial<GraphicsMediaSlots>) => {
    if (readOnly) return;
    onChange({ ...bus, media: { ...bus.media, ...p } });
  };

  return (
    <section className={`gfx-bus tactile-node ${ring}`}>
      <header className="gfx-bus__head">
        <div>
          <h2 className="gfx-bus__title">{title}</h2>
          <p className="gfx-bus__sub">{subtitle}</p>
        </div>
        <span className={`gfx-bus__pill ${variant === "program" ? "gfx-bus__pill--air" : ""}`}>
          {variant === "preview" ? "NEXT" : "ON AIR"}
        </span>
      </header>

      <div className="gfx-bus__section">
        <h3 className="gfx-bus__section-title">Video / stills</h3>
        <MediaSlotRow
          label="Background (fill)"
          assets={assets}
          assetId={bus.media.backgroundAssetId}
          urlField={bus.media.backgroundUrl}
          readOnly={!!readOnly}
          filter="all"
          onAssetId={(id) => patchMedia({ backgroundAssetId: id })}
          onUrl={(backgroundUrl) => patchMedia({ backgroundUrl })}
        />
        <MediaSlotRow
          label="Overlay / bug plate"
          assets={assets}
          assetId={bus.media.overlayAssetId}
          urlField={bus.media.overlayUrl}
          readOnly={!!readOnly}
          filter="all"
          onAssetId={(id) => patchMedia({ overlayAssetId: id })}
          onUrl={(overlayUrl) => patchMedia({ overlayUrl })}
        />
        <MediaSlotRow
          label="Logo"
          assets={assets}
          assetId={bus.media.logoAssetId}
          urlField={bus.media.logoUrl}
          readOnly={!!readOnly}
          filter="image"
          onAssetId={(id) => patchMedia({ logoAssetId: id })}
          onUrl={(logoUrl) => patchMedia({ logoUrl })}
        />
      </div>

      <label className="gfx-field">
        <span className="technical-label">Scene</span>
        <select
          className="gfx-input"
          disabled={readOnly}
          value={bus.sceneId}
          onChange={(e) => onChange({ ...bus, sceneId: e.target.value })}
        >
          {!presets.some((p) => p.id === bus.sceneId) && bus.sceneId ? (
            <option value={bus.sceneId}>{bus.sceneId}</option>
          ) : null}
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="gfx-field">
        <span className="technical-label">Primary line</span>
        <input
          className="gfx-input"
          disabled={readOnly}
          value={bus.primaryLine}
          onChange={(e) => onChange({ ...bus, primaryLine: e.target.value })}
          placeholder="Headline / team name"
        />
      </label>

      <label className="gfx-field">
        <span className="technical-label">Secondary line</span>
        <input
          className="gfx-input"
          disabled={readOnly}
          value={bus.secondaryLine}
          onChange={(e) => onChange({ ...bus, secondaryLine: e.target.value })}
          placeholder="Subtitle / location"
        />
      </label>

      <label className="gfx-field">
        <span className="technical-label">Crawl</span>
        <textarea
          className="gfx-input gfx-input--area"
          disabled={readOnly}
          rows={2}
          value={bus.crawl}
          onChange={(e) => onChange({ ...bus, crawl: e.target.value })}
          placeholder="Ticker text"
        />
      </label>

      <label className="gfx-field">
        <span className="technical-label">Bug / strap</span>
        <input
          className="gfx-input"
          disabled={readOnly}
          value={bus.bug}
          onChange={(e) => onChange({ ...bus, bug: e.target.value })}
          placeholder="Corner bug"
        />
      </label>

      <div className="gfx-layers">
        <span className="technical-label">Layers</span>
        <div className="gfx-chips">
          {LAYER_KEYS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              disabled={readOnly}
              className={`gfx-chip ${bus.layers[key] ? "is-on" : ""}`}
              onClick={() => setLayer(key, !bus.layers[key])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function GraphicsPage() {
  const [doc, setDoc] = useState<GraphicsDoc | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [modules, setModules] = useState<Array<{ id: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  const loadAssets = useCallback(async () => {
    const res = await fetch("/api/graphics-assets", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) return;
    const rows = Array.isArray(data.assets) ? data.assets : [];
    setAssets(
      rows.map((a: AssetRow) => ({
        id: a.id,
        url: a.url,
        kind: a.kind,
        originalName: a.originalName || a.id,
      }))
    );
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/graphics-show", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Failed to load");
      return;
    }
    setDoc(data as GraphicsDoc);
    setMsg(null);
    setCanWrite(Boolean((data as GraphicsDoc).canWrite));
  }, []);

  useEffect(() => {
    void load();
    void loadAssets();
  }, [load, loadAssets]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/overlay-modules", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) return;
      const mods = Array.isArray(data.modules)
        ? data.modules.map((m: { id: string; label: string }) => ({ id: m.id, label: m.label }))
        : [];
      setModules(mods);
    })();
  }, []);

  async function save() {
    if (!doc) return;
    setBusy(true);
    setMsg(null);
    try {
      const { canWrite: _cw, ...payload } = doc;
      const res = await fetch("/api/graphics-show", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Save failed");
      else {
        setDoc(data as GraphicsDoc);
        setMsg("Graphics state saved");
      }
    } catch {
      setMsg("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/graphics-show", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Action failed");
      else {
        setDoc(data as GraphicsDoc);
        setMsg(
          action === "take"
            ? "Taken — program updated from preview"
            : action === "cut"
              ? "Cut — program updated, preview cleared"
              : "Done"
        );
      }
    } catch {
      setMsg("Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files?.length || !canWrite) return;
    setBusy(true);
    setMsg(null);
    try {
      let lastErr: string | null = null;
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/graphics-assets/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          lastErr = (data as { error?: string }).error || "Upload failed";
          break;
        }
      }
      await loadAssets();
      setMsg(lastErr ?? "Upload complete — assign in Preview / Program below.");
    } catch {
      setMsg("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(id: string) {
    if (!canWrite || !confirm("Remove this file from the library?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/graphics-assets?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg((data as { error?: string }).error || "Delete failed");
      } else {
        await loadAssets();
        setMsg("Asset removed");
      }
    } catch {
      setMsg("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return (
      <main className="tactical-root gfx-page">
        <TopNav />
        <p className="gfx-loading">{msg || "Loading graphics…"}</p>
      </main>
    );
  }

  const write = canWrite;

  return (
    <main className="tactical-root gfx-page">
      <TopNav />
      <div className="gfx-shell">
        <header className="gfx-header tactile-node">
          <div>
            <h1 className="pane-title">Graphics</h1>
            <p className="gfx-lede">
              Upload PNG / JPG / WebP / GIF / MP4 / WebM, assign them to Preview or Program, or paste any http(s) or
              site path for extra sources. Monitors below update live. Render engines poll{" "}
              <code className="mono">GET /api/graphics-show</code> for the same fields.
            </p>
          </div>
          <div className="gfx-header-actions">
            <button type="button" className="gfx-btn" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
            <button type="button" className="gfx-btn gfx-btn--accent" disabled={busy || !write} onClick={() => void save()}>
              Save
            </button>
            <a className="gfx-btn gfx-btn--ghost" href="/overlay-modules">
              Modules setup
            </a>
          </div>
          {msg ? <p className="gfx-msg">{msg}</p> : null}
        </header>

        <section className="gfx-monitors tactile-node">
          <h2 className="technical-label gfx-monitors__title">Program monitors</h2>
          <div className="gfx-monitors__grid">
            <MediaMonitor label="PREVIEW (PVW)" variant="pvw" bus={doc.preview} assets={assets} />
            <MediaMonitor label="PROGRAM (PGM)" variant="pgm" bus={doc.program} assets={assets} />
          </div>
        </section>

        <section className="gfx-library tactile-node">
          <div className="gfx-library__head">
            <h2 className="technical-label">Media library</h2>
            <label className="gfx-upload">
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                disabled={!write || busy}
                onChange={(e) => void onUploadFiles(e.target.files)}
              />
              <span className="gfx-btn gfx-btn--accent">Add images / video</span>
            </label>
          </div>
          <p className="gfx-library__hint">
            Max ~25MB images, ~120MB video. Files are stored under <code className="mono">/junction-graphics/</code>.
          </p>
          <div className="gfx-library__grid">
            {assets.length === 0 ? (
              <p className="gfx-library__empty">No uploads yet — add PNG or MP4 to see thumbnails here.</p>
            ) : (
              assets.map((a) => (
                <figure key={a.id} className="gfx-thumb">
                  <div className="gfx-thumb__frame">
                    {a.kind === "video" ? (
                      <video src={a.url} muted playsInline preload="metadata" className="gfx-thumb__media" />
                    ) : (
                      <img src={a.url} alt="" className="gfx-thumb__media" />
                    )}
                  </div>
                  <figcaption className="gfx-thumb__cap">
                    <span className="mono gfx-thumb__name">{a.originalName}</span>
                    <span className="gfx-thumb__meta">{a.kind}</span>
                    {write ? (
                      <button type="button" className="gfx-thumb__del" onClick={() => void removeAsset(a.id)}>
                        Remove
                      </button>
                    ) : null}
                  </figcaption>
                </figure>
              ))
            )}
          </div>
        </section>

        <section className="gfx-meta tactile-node">
          <label className="gfx-field gfx-field--inline">
            <span className="technical-label">Target overlay module</span>
            <select
              className="gfx-input gfx-input--narrow"
              disabled={!write}
              value={doc.targetModuleId ?? ""}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  targetModuleId: e.target.value || null,
                })
              }
            >
              <option value="">— none —</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </select>
          </label>
          <label className="gfx-field">
            <span className="technical-label">Operator notes</span>
            <input
              className="gfx-input"
              disabled={!write}
              value={doc.notes}
              onChange={(e) => setDoc({ ...doc, notes: e.target.value })}
              placeholder="Optional cues for the gallery…"
            />
          </label>
        </section>

        <section className="gfx-transport tactile-node">
          <div className="gfx-transport-inner">
            <button
              type="button"
              className="gfx-take"
              disabled={busy || !write}
              title="Copy preview → program (preview unchanged)"
              onClick={() => void transition("take")}
            >
              TAKE
            </button>
            <button
              type="button"
              className="gfx-btn gfx-btn--warn"
              disabled={busy || !write}
              title="Copy preview → program and clear preview"
              onClick={() => void transition("cut")}
            >
              CUT
            </button>
            <button
              type="button"
              className="gfx-btn"
              disabled={busy || !write}
              onClick={() => void transition("clear_preview")}
            >
              Clear preview
            </button>
            <button
              type="button"
              className="gfx-btn gfx-btn--danger"
              disabled={busy || !write}
              onClick={() => void transition("clear_program")}
            >
              Clear program
            </button>
            <button
              type="button"
              className="gfx-btn"
              disabled={busy || !write}
              onClick={() => void transition("copy_program_to_preview")}
            >
              PGM → PVW
            </button>
          </div>
        </section>

        <div className="gfx-buses">
          <BusPanel
            title="Preview"
            subtitle="Compose the next graphic here"
            variant="preview"
            bus={doc.preview}
            presets={doc.scenePresets}
            assets={assets}
            readOnly={!write}
            onChange={(preview) => setDoc({ ...doc, preview })}
          />
          <BusPanel
            title="Program"
            subtitle="What your engine follows on air"
            variant="program"
            bus={doc.program}
            presets={doc.scenePresets}
            assets={assets}
            readOnly={!write}
            onChange={(program) => setDoc({ ...doc, program })}
          />
        </div>

        {!write ? (
          <p className="gfx-ro-hint technical-label">View-only — need overlay control or rack configure permission to operate.</p>
        ) : null}
      </div>
    </main>
  );
}
