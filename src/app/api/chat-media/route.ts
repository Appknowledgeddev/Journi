import { NextRequest, NextResponse } from "next/server";

type GiphyItem = {
  id: string;
  title?: string;
  images?: {
    fixed_height?: { webp?: string; url?: string; width?: string; height?: string };
    original?: { webp?: string; url?: string; width?: string; height?: string };
  };
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const type = request.nextUrl.searchParams.get("type") === "gif" ? "gifs" : "stickers";
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedOffset = Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;
  const limit = 30;
  const endpoint = query ? "search" : "trending";
  const url = new URL(`https://api.giphy.com/v1/${type}/${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("rating", "pg");
  if (query) url.searchParams.set("q", query);

  try {
    const response = await fetch(url, { next: { revalidate: query ? 0 : 300 } });
    if (!response.ok) throw new Error("GIPHY request failed");
    const payload = (await response.json()) as {
      data?: GiphyItem[];
      pagination?: { total_count?: number; count?: number; offset?: number };
    };
    const count = payload.pagination?.count ?? payload.data?.length ?? 0;
    const nextOffset = offset + count;
    const totalCount = payload.pagination?.total_count ?? 0;
    return NextResponse.json({
      configured: true,
      items: (payload.data ?? []).flatMap((item) => {
        const preview = item.images?.fixed_height?.webp || item.images?.fixed_height?.url;
        const original = item.images?.original?.webp || item.images?.original?.url;
        if (!preview || !original) return [];
        return [{ id: item.id, title: item.title || (type === "gifs" ? "GIF" : "Sticker"), preview, url: original }];
      }),
      nextOffset,
      hasMore: count === limit && (totalCount <= 0 || nextOffset < totalCount),
    });
  } catch {
    return NextResponse.json({ configured: true, items: [], error: "Unable to load GIPHY right now." }, { status: 502 });
  }
}
