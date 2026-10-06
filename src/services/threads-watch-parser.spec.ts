import { normalizeWatchUrl, parseWatchEmbed } from './threads-watch-parser';

// Structure from the public embed HTML, with a text-only post and no repost count.
const embed = `<script>{"like_count":999999}</script>
<span class="TextContentContainer"><span class="BodyTextContainer"><span>First &amp; second<br />&#x1f913; &lt;script&gt;</span></span></span>
<div class="PostDateContainer"><span class="Timestamp">4:26 AM · Oct 6, 2026</span></div>
<div class="ActionBarContainer">
<span class="ActionBarIcon"><svg></svg><span class="ActionBarCount">10</span></span>
<span class="ActionBarIcon"><svg></svg><span class="ActionBarCount">66</span></span>
<span class="ActionBarIcon"><svg></svg></span>
<span class="ActionBarIcon"><svg></svg><span class="ActionBarCount">6</span></span></div>`;

describe('Threads watch public embed', () => {
  it('normalizes .net/.com aliases and removes tracking parameters', () => {
    expect(
      normalizeWatchUrl(
        'https://threads.net/@den_arkh/post/DeJrJSxjgUt/?xmt=abc#reply',
      ),
    ).toEqual({
      url: 'https://www.threads.com/@den_arkh/post/DeJrJSxjgUt',
      username: 'den_arkh',
      code: 'DeJrJSxjgUt',
    });
  });
  it.each([
    'https://www.threads.com.evil.test/@test/post/abc',
    'https://www.threads.com@127.0.0.1/@test/post/abc',
    'http://www.threads.com/@test/post/abc',
    'https://www.threads.com:8443/@test/post/abc',
    'https://www.threads.com/@test/post/abc/embed',
    'https://www.threads.com/@test',
  ])('rejects invalid or arbitrary fetch targets: %s', (url) => {
    expect(() => normalizeWatchUrl(url)).toThrow();
  });
  it('keeps missing counts unknown, maps share independently and decodes text', () => {
    const result = parseWatchEmbed(embed);
    expect(result.text).toBe('First & second\n🤓 <script>');
    expect(result.stats).toMatchObject({
      likes: 10,
      replies: 66,
      shares: 6,
      approximate: [],
    });
    expect(result.stats.reposts).toBeUndefined();
  });
  it('marks scaled counts as approximate and preserves explicit zero', () => {
    const result = parseWatchEmbed(
      embed.replace('>10<', '>1.5K<').replace('>66<', '>0<'),
    );
    expect(result.stats).toMatchObject({
      likes: 1500,
      replies: 0,
      approximate: ['likes'],
    });
  });
  it('refuses to map counters when the action layout has changed', () => {
    const result = parseWatchEmbed(
      embed.replace(/<span class="ActionBarIcon"><svg><\/svg><\/span>/, ''),
    );
    expect(result.stats.likes).toBeUndefined();
    expect(result.stats.shares).toBeUndefined();
  });
  it('rejects unavailable/login pages rather than saving fabricated data', () => {
    expect(() => parseWatchEmbed('<html>Sign in to Threads</html>')).toThrow();
  });
});
