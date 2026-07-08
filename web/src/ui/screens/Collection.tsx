import { useEffect, useState } from "react";
import { listItems, deleteItems } from "../../units/collection";
import type { CollectionItem } from "../../types";
import { BackIcon, TrashIcon, CheckIcon } from "../icons";

export function Collection({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function reload() {
    setItems(await listItems());
  }
  useEffect(() => {
    void reload();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function remove() {
    await deleteItems([...selected]);
    setSelected(new Set());
    setSelecting(false);
    await reload();
  }

  return (
    <div className="fb-screen">
      <div className="fb-topbar">
        <span role="button" aria-label="Back" onClick={onBack} style={{ cursor: "pointer", color: "var(--fb-blue)", display: "flex" }}>
          <BackIcon />
        </span>
        <strong>Your Backs</strong>
        <button className="fb-btn sec" style={{ width: "auto", padding: "6px 10px" }} onClick={() => { setSelecting((s) => !s); setSelected(new Set()); }}>
          {selecting ? "Cancel" : "Select"}
        </button>
      </div>
      <div style={{ flex: 1, padding: 12 }}>
        {items.length === 0 ? (
          <div style={{ color: "var(--fb-muted)", textAlign: "center", marginTop: 40 }}>No backs yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {items.map((it) => (
              <div
                key={it.id}
                data-testid={`tile-${it.id}`}
                onClick={() => selecting && toggle(it.id)}
                style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", outline: selected.has(it.id) ? "3px solid var(--fb-blue)" : "none", cursor: selecting ? "pointer" : "default" }}
              >
                <img src={URL.createObjectURL(it.imageBlob)} alt="back of head" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {selecting && selected.has(it.id) ? (
                  <span style={{ position: "absolute", top: 4, right: 4, background: "var(--fb-blue)", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckIcon />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
      {selecting ? (
        <div style={{ padding: 12, borderTop: "1px solid var(--fb-line)", background: "var(--fb-card)" }}>
          <button className="fb-btn" style={{ background: "#c0271b" }} disabled={selected.size === 0} onClick={remove}>
            <TrashIcon /> Delete ({selected.size})
          </button>
        </div>
      ) : null}
    </div>
  );
}
