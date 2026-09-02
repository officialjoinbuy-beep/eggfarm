import { NextRequest, NextResponse } from "next/server";

// 공구 등록 화면에서 아파트 단지를 "이름"이 아니라 "정확한 주소"로 등록할 수
// 있도록, 카카오맵 키워드 검색(Local API)을 서버에서 대신 호출해준다.
// (REST API 키를 클라이언트에 노출하지 않기 위해 프록시로 감싼다.)
// 카카오 디벨로퍼스 앱에서 "카카오맵" 제품이 활성화돼 있어야 동작한다.
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) {
    return NextResponse.json(
      { error: "카카오맵 연동이 설정되지 않았습니다. (KAKAO_REST_API_KEY 필요)" },
      { status: 501 }
    );
  }

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
    query
  )}&category_group_code=AD5&size=8`;

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${restApiKey}` },
  });

  if (!res.ok) {
    // AD5(아파트) 카테고리로 못 찾으면 카테고리 제한 없이 한 번 더 시도
    const fallbackUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
      query
    )}&size=8`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
    if (!fallbackRes.ok) {
      return NextResponse.json({ error: "검색에 실패했습니다." }, { status: 502 });
    }
    const fallbackData = await fallbackRes.json();
    return NextResponse.json({ results: mapResults(fallbackData) });
  }

  const data = await res.json();
  let results = mapResults(data);

  if (results.length === 0) {
    const fallbackUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
      query
    )}&size=8`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
    if (fallbackRes.ok) {
      results = mapResults(await fallbackRes.json());
    }
  }

  return NextResponse.json({ results });
}

function mapResults(data: {
  documents?: { id: string; place_name: string; road_address_name: string; address_name: string }[];
}) {
  return (data.documents ?? []).map((d) => ({
    kakaoPlaceId: d.id,
    name: d.place_name,
    address: d.road_address_name || d.address_name,
  }));
}
