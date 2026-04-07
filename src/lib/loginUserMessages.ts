/** 실제 앱처럼 보이도록 OAuth/SDK 오류 문구를 일반 사용자용으로 변환 */
export function loginErrorForUser(raw: string): string {
  const t = raw.toLowerCase();
  if (raw.includes("배포 환경")) {
    return "이 환경에서는 지금 로그인을 완료할 수 없습니다.";
  }
  if (
    t.includes("401") ||
    t.includes("unauthorized") ||
    t.includes("bad client")
  ) {
    return "로그인 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (t.includes("koe006") || t.includes("redirect_uri")) {
    return "로그인 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (t.includes("access_token")) {
    return "로그인 처리 중 오류가 났습니다. 다시 시도해 주세요.";
  }
  if (t.includes("kakao") && t.includes("sdk")) {
    return "일시적으로 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "로그인에 문제가 생겼습니다. 다시 시도해 주세요.";
}
