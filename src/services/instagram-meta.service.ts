import { Injectable, Logger } from '@nestjs/common';

export type InstagramMeta = {
  username?: string;
  fullName?: string;
  caption?: string;
  publishedAt?: string; // ISO date
  likeCount?: number;
  commentCount?: number;
  thumbnailUrl?: string; // signed Instagram CDN URL, expires
  coverUrl?: string; // permanent copy in DO Spaces
  canonicalUrl?: string;
  fetchedAt: string;
};

// Instagram serves crawler-rendered og: meta tags (author, date, counters,
// caption, thumbnail) only to known crawler user agents; browsers get an
// empty JS shell instead.
const CRAWLER_USER_AGENT =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

@Injectable()
export class InstagramMetaService {
  private readonly logger = new Logger(InstagramMetaService.name);

  async fetchMeta(instagramUrl: string): Promise<InstagramMeta | null> {
    const match =
      /instagram\.com\/(?:[^/]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)/.exec(
        instagramUrl,
      );
    if (!match) return null;

    let html: string;
    try {
      const response = await fetch(`https://www.instagram.com/p/${match[2]}/`, {
        headers: {
          'User-Agent': CRAWLER_USER_AGENT,
          'Accept-Language': 'en',
        },
      });
      if (!response.ok) {
        this.logger.warn(
          `Instagram responded ${response.status} for ${instagramUrl}`,
        );
        return null;
      }
      html = await response.text();
    } catch (error) {
      this.logger.warn(`Failed to fetch Instagram page: ${String(error)}`);
      return null;
    }

    const og = (property: string): string | undefined => {
      const tag = new RegExp(
        `<meta property="og:${property}" content="([^"]*)"`,
      ).exec(html);
      return tag ? this.decodeEntities(tag[1]) : undefined;
    };

    const meta: InstagramMeta = { fetchedAt: new Date().toISOString() };

    const canonicalUrl = og('url');
    if (canonicalUrl) {
      meta.canonicalUrl = canonicalUrl;
      const user = /instagram\.com\/([^/]+)\/(?:reel|p|tv)\//.exec(
        canonicalUrl,
      );
      if (user) meta.username = user[1];
    }

    // "Full Name on Instagram: "caption text""
    const title = og('title');
    if (title) {
      const split = title.split(' on Instagram: ');
      if (split.length >= 2) {
        meta.fullName = split[0];
        meta.caption = split
          .slice(1)
          .join(' on Instagram: ')
          .replace(/^"|"$/g, '');
      }
    }

    // "19 likes, 2 comments - vlandivir on June 27, 2026: "caption""
    const description = og('description');
    if (description) {
      const likes = /^([\d,.]+[KM]?) likes?/.exec(description);
      if (likes) meta.likeCount = this.parseCount(likes[1]);
      const comments = /([\d,.]+[KM]?) comments?/.exec(description);
      if (comments) meta.commentCount = this.parseCount(comments[1]);
      const author = /- ([A-Za-z0-9._]+) on ([A-Za-z]+ \d{1,2}, \d{4})/.exec(
        description,
      );
      if (author) {
        meta.username = meta.username || author[1];
        const published = new Date(author[2]);
        if (!Number.isNaN(published.getTime())) {
          meta.publishedAt = published.toISOString();
        }
      }
    }

    const image = og('image');
    if (image) meta.thumbnailUrl = image;

    // Consider the fetch successful only if we extracted something real
    const hasData =
      meta.username !== undefined ||
      meta.publishedAt !== undefined ||
      meta.caption !== undefined;
    return hasData ? meta : null;
  }

  private parseCount(raw: string): number | undefined {
    const normalized = raw.replace(/,/g, '');
    const scaled = /^([\d.]+)([KM])$/.exec(normalized);
    if (scaled) {
      const base = Number(scaled[1]);
      return Math.round(base * (scaled[2] === 'K' ? 1_000 : 1_000_000));
    }
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }

  private decodeEntities(text: string): string {
    return text
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec: string) =>
        String.fromCodePoint(Number(dec)),
      )
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'");
  }
}
