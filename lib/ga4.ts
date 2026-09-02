import crypto from "crypto";

// GA4 Data API로 방문자 수를 조회하는 유틸. googleapis 같은 무거운 패키지 없이
// 서비스 계정 JWT를 직접 서명해서 액세스 토큰을 받아온다.
// GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_KEY(서비스 계정 JSON 문자열 그대로)
// 두 환경변수가 모두 설정돼야 동작하고, 없으면 null을 반환한다(콘솔 쪽에서
// "GA4 연동 전" 안내로 대체).
type ServiceAccountKey = { client_email: string; private_key: string };

async function getAccessToken(): Promise<string | null> {
  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  let key: ServiceAccountKey;
  try {
    key = JSON.parse(raw);
  } catch {
    return null;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${b64url(header)}.${b64url(claim)}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer
    .sign(key.private_key)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

export async function getGa4VisitorCounts(): Promise<{ today: number; last7Days: number } | null> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return null;

  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
      }),
    }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const rows: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] =
    data.rows ?? [];

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let today = 0;
  let last7Days = 0;
  for (const row of rows) {
    const count = Number(row.metricValues[0]?.value ?? 0);
    last7Days += count;
    if (row.dimensionValues[0]?.value === todayStr) today = count;
  }
  return { today, last7Days };
}
