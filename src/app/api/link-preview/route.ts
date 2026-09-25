import { lookup } from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { getLinkPreview } from "link-preview-js";
import { supabaseAdmin } from "@/lib/supabase/server";

type PreviewResponse = {
  url: string;
  title: string;
  description: string;
  siteName: string;
  image: string;
  imageType: "preview" | "favicon";
};

function isYouTubeUrl(url: URL) {
  return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
    url.hostname.toLowerCase(),
  );
}

function isTikTokUrl(url: URL) {
  return ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"].includes(
    url.hostname.toLowerCase(),
  );
}

function isInstagramUrl(url: URL) {
  return ["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase());
}

function isFacebookUrl(url: URL) {
  return ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(
    url.hostname.toLowerCase(),
  );
}

function isFacebookHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch";
}

function isXUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "x.com" || host === "twitter.com";
}

function isXHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "x.com" || host === "twitter.com" || host === "t.co";
}

type OEmbedMetadata = {
  title?: string;
  description?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
};

async function fetchOEmbed(endpoint: string, target: URL) {
  const response = await fetch(
    `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(target.toString())}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("Provider preview unavailable");
  return (await response.json()) as OEmbedMetadata;
}

function oEmbedResponse(target: URL, metadata: OEmbedMetadata, fallbackName: string) {
  return NextResponse.json({
    url: target.toString(),
    title: metadata.title || `${fallbackName} post`,
    description: metadata.description || metadata.author_name || "",
    siteName: metadata.provider_name || fallbackName,
    image: metadata.thumbnail_url || "",
    imageType: metadata.thumbnail_url ? "preview" : "favicon",
  } satisfies PreviewResponse);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid user session." }, { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
  let target: URL;

  try {
    target = new URL(rawUrl);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error("Unsupported URL");
  } catch {
    return NextResponse.json({ error: "Enter a valid public web address." }, { status: 400 });
  }

  try {
    if (isYouTubeUrl(target)) {
      const metadata = await fetchOEmbed(
        "https://www.youtube.com/oembed?format=json",
        target,
      );
      return oEmbedResponse(target, metadata, "YouTube");
    }

    if (isTikTokUrl(target)) {
      try {
        const metadata = await fetchOEmbed("https://www.tiktok.com/oembed", target);
        return oEmbedResponse(target, metadata, "TikTok");
      } catch {
        // Continue to the generic Open Graph preview for unsupported TikTok URLs.
      }
    }

    const publicOEmbedProvider = [
      {
        matches: (host: string) => host === "vimeo.com" || host.endsWith(".vimeo.com"),
        endpoint: "https://vimeo.com/api/oembed.json",
        name: "Vimeo",
      },
      {
        matches: (host: string) => host === "open.spotify.com" || host === "spotify.link",
        endpoint: "https://open.spotify.com/oembed",
        name: "Spotify",
      },
      {
        matches: (host: string) => host === "soundcloud.com" || host.endsWith(".soundcloud.com"),
        endpoint: "https://soundcloud.com/oembed?format=json",
        name: "SoundCloud",
      },
      {
        matches: (host: string) => host === "dailymotion.com" || host.endsWith(".dailymotion.com") || host === "dai.ly",
        endpoint: "https://www.dailymotion.com/services/oembed",
        name: "Dailymotion",
      },
      {
        matches: (host: string) => host === "loom.com" || host.endsWith(".loom.com"),
        endpoint: "https://www.loom.com/v1/oembed",
        name: "Loom",
      },
    ].find((provider) => provider.matches(target.hostname.toLowerCase()));

    if (publicOEmbedProvider) {
      try {
        const metadata = await fetchOEmbed(publicOEmbedProvider.endpoint, target);
        return oEmbedResponse(target, metadata, publicOEmbedProvider.name);
      } catch {
        // Continue to Open Graph when an item is private or the provider rejects it.
      }
    }

    const metaAccessToken = process.env.META_OEMBED_ACCESS_TOKEN?.trim();
    if (metaAccessToken && (isInstagramUrl(target) || isFacebookUrl(target))) {
      try {
        const endpoint = isInstagramUrl(target)
          ? "https://graph.facebook.com/instagram_oembed"
          : "https://graph.facebook.com/oembed_post";
        const metadata = await fetchOEmbed(
          `${endpoint}?access_token=${encodeURIComponent(metaAccessToken)}&omitscript=true`,
          target,
        );
        return oEmbedResponse(
          target,
          metadata,
          isInstagramUrl(target) ? "Instagram" : "Facebook",
        );
      } catch {
        // Meta may reject private, removed, or unsupported posts; try page metadata.
      }
    }

    const facebookTarget = isFacebookUrl(target);
    const xTarget = isXUrl(target);
    const socialRedirectTarget = facebookTarget || xTarget;
    const metadata = await getLinkPreview(target.toString(), {
      timeout: 5000,
      followRedirects: socialRedirectTarget ? "manual" : "error",
      handleRedirects: socialRedirectTarget
        ? (baseUrl, forwardedUrl) => {
            try {
              const nextUrl = new URL(forwardedUrl, baseUrl);
              return (
                nextUrl.protocol === "https:" &&
                (facebookTarget
                  ? isFacebookHost(nextUrl.hostname)
                  : isXHost(nextUrl.hostname))
              );
            } catch {
              return false;
            }
          }
        : undefined,
      imagesPropertyType: "og",
      headers: {
        "user-agent": facebookTarget
          ? "facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)"
          : xTarget
            ? "Twitterbot/1.0"
            : "JourniLinkPreview/1.0",
        "accept-language": "en-GB,en;q=0.9",
      },
      resolveDNSHost: async (url) => {
        const result = await lookup(new URL(url).hostname);
        return result.address;
      },
    });

    if (!("title" in metadata)) {
      throw new Error("No preview metadata found");
    }

    const previewImage = metadata.images?.[0] || "";
    const favicon = metadata.favicons?.[0] || "";

    return NextResponse.json({
      url: metadata.url || target.toString(),
      title: metadata.title || target.hostname,
      description: metadata.description || "",
      siteName:
        (xTarget ? "X" : metadata.siteName) || target.hostname.replace(/^www\./, ""),
      image: previewImage || favicon,
      imageType: previewImage ? "preview" : "favicon",
    } satisfies PreviewResponse);
  } catch {
    return NextResponse.json({
      url: target.toString(),
      title: target.hostname.replace(/^www\./, ""),
      description: "",
      siteName: target.hostname.replace(/^www\./, ""),
      image: "",
      imageType: "favicon",
    } satisfies PreviewResponse);
  }
}
