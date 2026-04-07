import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { VisitMarker, VisitPhoto } from "../types/domain";

function normalizeMarker(m: VisitMarker): VisitMarker {
  return {
    ...m,
    visibility: m.visibility ?? "private",
    owner: m.owner ?? "local",
  };
}

async function canvasColorBlob(
  w: number,
  h: number,
  bg: string,
  label: string,
): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2);
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85);
  });
}

const DEMO_SEED_KEY = "taste-road-demo-seeded";

export async function ensureDemoSharedPins(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(DEMO_SEED_KEY) === "1") return;

  const db = await getDb();
  const existing = await db.getAll("markers");
  if (existing.some((m) => m.owner === "demo")) {
    localStorage.setItem(DEMO_SEED_KEY, "1");
    return;
  }

  const spots: VisitMarker[] = [
    {
      id: "demo-shared-1",
      lat: 37.5668,
      lng: 126.9785,
      title: "공유 맛집 A",
      note: "다른 사용자가 공유한 예시예요.",
      createdAt: Date.now() - 86400000 * 3,
      visibility: "shared",
      owner: "demo",
    },
    {
      id: "demo-shared-2",
      lat: 37.5547,
      lng: 126.9707,
      title: "공유 카페 B",
      note: "Share 모드에서만 지도·피드에 보여요.",
      createdAt: Date.now() - 86400000 * 2,
      visibility: "shared",
      owner: "demo",
    },
  ];

  for (const m of spots) {
    await db.put("markers", m);
    const blob = await canvasColorBlob(
      96,
      96,
      m.id.endsWith("1") ? "#0d9488" : "#7c3aed",
      "share",
    );
    await db.put("photos", {
      id: `demo-ph-${m.id}`,
      markerId: m.id,
      createdAt: m.createdAt,
      blob,
    });
  }

  localStorage.setItem(DEMO_SEED_KEY, "1");
}

interface TasteRoadSchema extends DBSchema {
  markers: {
    key: string;
    value: VisitMarker;
  };
  photos: {
    key: string;
    value: VisitPhoto;
  };
}

let dbPromise: Promise<IDBPDatabase<TasteRoadSchema>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TasteRoadSchema>("taste-road", 1, {
      upgrade(db) {
        db.createObjectStore("markers", { keyPath: "id" });
        db.createObjectStore("photos", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function saveMarker(m: VisitMarker) {
  const db = await getDb();
  await db.put("markers", m);
}

export async function loadMarkers(): Promise<VisitMarker[]> {
  const db = await getDb();
  const all = await db.getAll("markers");
  return all.map(normalizeMarker);
}

export async function removeMarker(id: string) {
  const db = await getDb();
  const photos = await db.getAll("photos");
  await Promise.all(
    photos.filter((p) => p.markerId === id).map((p) => db.delete("photos", p.id)),
  );
  await db.delete("markers", id);
}

export async function savePhoto(p: VisitPhoto) {
  const db = await getDb();
  await db.put("photos", p);
}

export async function loadPhotosForMarker(markerId: string): Promise<VisitPhoto[]> {
  const db = await getDb();
  const all = await db.getAll("photos");
  return all
    .filter((p) => p.markerId === markerId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadAllPhotos(): Promise<VisitPhoto[]> {
  const db = await getDb();
  const all = await db.getAll("photos");
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
