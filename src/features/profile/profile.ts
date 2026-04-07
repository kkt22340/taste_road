export type Profile = {
  nickname?: string;
  avatarDataUrl?: string;
};

const KEY = "taste-road-profile-v1";

export function getProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as Profile;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export function setProfile(next: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function setNickname(nickname: string): void {
  const n = nickname.trim();
  const p = getProfile();
  setProfile({ ...p, nickname: n });
}

export function setAvatarDataUrl(avatarDataUrl: string | undefined): void {
  const p = getProfile();
  if (!avatarDataUrl) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { avatarDataUrl: _drop, ...rest } = p;
    setProfile(rest);
    return;
  }
  setProfile({ ...p, avatarDataUrl });
}

