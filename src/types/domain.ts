export type VisitMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  createdAt: number;
};

export type VisitPhoto = {
  id: string;
  markerId: string;
  createdAt: number;
  blob: Blob;
};
