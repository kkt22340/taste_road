import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { VisitMarker, VisitPhoto } from "../types/domain";

function normalizeMarker(m: VisitMarker): VisitMarker {
  return {
    ...m,
    visibility: m.visibility ?? "private",
    owner: m.owner ?? "local",
  };
}

export async function purgeDemoContent(): Promise<void> {
  const db = await getDb();
  const [markers, photos] = await Promise.all([db.getAll("markers"), db.getAll("photos")]);
  const demoMarkerIds = new Set(markers.filter((m) => m.owner === "demo").map((m) => m.id));
  if (demoMarkerIds.size === 0) return;
  await Promise.all([
    ...markers.filter((m) => demoMarkerIds.has(m.id)).map((m) => db.delete("markers", m.id)),
    ...photos.filter((p) => demoMarkerIds.has(p.markerId)).map((p) => db.delete("photos", p.id)),
  ]);
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
