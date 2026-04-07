const KEY = "taste-road-liked-photo-ids-v1";

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
}

export function isPhotoLiked(photoId: string): boolean {
  return readSet().has(photoId);
}

export function togglePhotoLike(photoId: string): boolean {
  const set = readSet();
  if (set.has(photoId)) set.delete(photoId);
  else set.add(photoId);
  writeSet(set);
  return set.has(photoId);
}

