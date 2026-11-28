import {
  inferMediaPreviewHint,
  resolveSignedMediaUrl,
  resolveTrustedApiOrigin,
  SIGNED_MEDIA_DEFAULT_TTL_SECONDS,
  SIGNED_MEDIA_PATH_PREFIX,
} from './signed-media-url.util';
import type {
  SignedMediaResolutionResult,
  SignedMediaResolutionStatus,
  SignedMediaValidResult,
} from './signed-media-url.util';

/**
 * These tests cover URL structure, trusted origin and expiry only.
 * HMAC authenticity is verified exclusively by the backend
 * (LocalMediaStorage.TryOpen); the frontend never verifies signatures.
 */

const BASE = 'https://api.fixora.test';
const HEX32 = '0123456789abcdef0123456789abcdef';
const SIG = 'a1'.repeat(32);
const EXP = 1_800_000_900;
const NOW_MS = (EXP - 900) * 1000;

function ref(ext = '.jpg'): string {
  return `${HEX32}${ext}`;
}

function rel(options?: {
  readonly ext?: string;
  readonly exp?: string | number;
  readonly sig?: string;
}): string {
  const exp = options?.exp ?? EXP;
  const sig = options?.sig ?? SIG;

  return `/api/v1/media/${ref(options?.ext)}?exp=${exp}&sig=${sig}`;
}

function expectValid(
  result: SignedMediaResolutionResult,
): SignedMediaValidResult {
  if (!result.ok) {
    throw new Error(
      `Expected valid result but got ${result.status}/${result.reason}`,
    );
  }

  return result;
}

function expectRejected(
  result: SignedMediaResolutionResult,
  status: SignedMediaResolutionStatus,
  reason: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.status).toBe(status);
  expect(result.reason).toBe(reason);
  expect(result.url).toBeNull();
}

describe('signed-media-url.util', () => {
  describe('constants', () => {
    it('SMU-01 mirrors the backend path prefix and 15 minute TTL', () => {
      expect(SIGNED_MEDIA_PATH_PREFIX).toBe('/api/v1/media/');
      expect(SIGNED_MEDIA_DEFAULT_TTL_SECONDS).toBe(900);
    });
  });

  describe('resolveTrustedApiOrigin', () => {
    it('SMU-02 returns the https origin only, dropping path prefix and trailing slash', () => {
      expect(resolveTrustedApiOrigin(BASE)).toEqual({
        ok: true,
        origin: BASE,
      });
      expect(resolveTrustedApiOrigin(`${BASE}/gateway/`)).toEqual({
        ok: true,
        origin: BASE,
      });
      expect(resolveTrustedApiOrigin(' https://API.Fixora.test:8443/x ')).toEqual({
        ok: true,
        origin: 'https://api.fixora.test:8443',
      });
    });

    it.each([null, undefined, '', '   '])(
      'SMU-03 reports a missing base URL (%j) as not configured',
      value => {
        expect(resolveTrustedApiOrigin(value)).toEqual({
          ok: false,
          reason: 'api-base-url-not-configured',
        });
      },
    );

    it.each([
      'not a url',
      '/relative/only',
      'http://api.fixora.test',
      'ftp://api.fixora.test',
      'javascript:alert(1)',
      'https://user:pw@api.fixora.test',
      'https://user@api.fixora.test',
      'https://api.fixora.test/?x=1',
      'https://api.fixora.test/#frag',
    ])('SMU-04 rejects invalid base URL %s', value => {
      expect(resolveTrustedApiOrigin(value)).toEqual({
        ok: false,
        reason: 'invalid-api-base-url',
      });
    });
  });

  describe('valid URLs', () => {
    it('SMU-05 accepts a backend-style relative signed URL and resolves it against the trusted origin', () => {
      const result = expectValid(
        resolveSignedMediaUrl(rel(), BASE, NOW_MS),
      );

      expect(result.url).toBe(`${BASE}${rel()}`);
      expect(result.mediaRef).toBe(ref());
      expect(result.previewHint).toBe('image');
      expect(result.status).toBe('valid');
      expect(result.reason).toBeNull();
      expect(result.message).toBeNull();
      expect(result.expiresAtUnixSeconds).toBe(EXP);
      expect(result.expiresAt).toEqual(new Date(EXP * 1000));
      expect(result.remainingSeconds).toBe(900);
    });

    it('SMU-06 accepts an absolute URL on the trusted origin', () => {
      const result = expectValid(
        resolveSignedMediaUrl(`${BASE}${rel()}`, BASE, NOW_MS),
      );

      expect(result.url).toBe(`${BASE}${rel()}`);
    });

    it('SMU-07 preserves the exact signed path and query, including parameter order', () => {
      const reversed = `/api/v1/media/${ref()}?sig=${SIG}&exp=${EXP}`;
      const result = expectValid(
        resolveSignedMediaUrl(reversed, BASE, NOW_MS),
      );
      const parsed = new URL(result.url);

      expect(result.url).toBe(`${BASE}${reversed}`);
      expect(parsed.pathname).toBe(`/api/v1/media/${ref()}`);
      expect(parsed.search).toBe(`?sig=${SIG}&exp=${EXP}`);
      expect(parsed.hash).toBe('');
      expect(parsed.username).toBe('');
      expect(parsed.password).toBe('');
    });

    it('SMU-08 resolves against the origin of a configured base URL that has a path prefix', () => {
      const prefixed = `${BASE}/gateway/`;

      expect(
        expectValid(resolveSignedMediaUrl(rel(), prefixed, NOW_MS)).url,
      ).toBe(`${BASE}${rel()}`);
      expect(
        expectValid(
          resolveSignedMediaUrl(`${BASE}${rel()}`, prefixed, NOW_MS),
        ).url,
      ).toBe(`${BASE}${rel()}`);
    });

    it('SMU-09 supports an explicit port on the trusted origin', () => {
      const base = 'https://api.fixora.test:8443';

      expect(
        expectValid(resolveSignedMediaUrl(rel(), base, NOW_MS)).url,
      ).toBe(`${base}${rel()}`);
      expect(
        expectValid(
          resolveSignedMediaUrl(`${base}${rel()}`, base, NOW_MS),
        ).url,
      ).toBe(`${base}${rel()}`);
    });

    it('SMU-10 accepts a structurally valid URL with any 64-hex signature because authenticity is the backend responsibility', () => {
      const arbitrary = rel({ sig: '0'.repeat(64) });
      const result = expectValid(
        resolveSignedMediaUrl(arbitrary, BASE, NOW_MS),
      );

      expect(result.url).toBe(`${BASE}${arbitrary}`);
    });

    it('SMU-11 accepts the .bin fallback extension and the extension characters _ and -', () => {
      expect(
        expectValid(
          resolveSignedMediaUrl(rel({ ext: '.bin' }), BASE, NOW_MS),
        ).previewHint,
      ).toBe('unsupported');
      expect(
        resolveSignedMediaUrl(rel({ ext: '.a_b' }), BASE, NOW_MS).ok,
      ).toBe(true);
      expect(
        resolveSignedMediaUrl(rel({ ext: '.a-b' }), BASE, NOW_MS).ok,
      ).toBe(true);
    });

    it('SMU-12 uses the real clock when none is supplied', () => {
      const future = rel({ exp: Math.floor(Date.now() / 1000) + 3600 });
      const past = rel({ exp: 1 });

      expect(resolveSignedMediaUrl(future, BASE).status).toBe('valid');
      expect(resolveSignedMediaUrl(past, BASE).status).toBe('expired');
    });
  });

  describe('media preview hints', () => {
    it.each([
      ['jpg', 'image'],
      ['jpeg', 'image'],
      ['png', 'image'],
      ['webp', 'image'],
      ['gif', 'image'],
      ['bmp', 'image'],
      ['avif', 'image'],
      ['mp4', 'video'],
      ['webm', 'video'],
      ['mov', 'video'],
      ['m4v', 'video'],
      ['3gp', 'video'],
      ['mp3', 'audio'],
      ['wav', 'audio'],
      ['ogg', 'audio'],
      ['m4a', 'audio'],
      ['aac', 'audio'],
      ['opus', 'audio'],
      ['flac', 'audio'],
      ['svg', 'unsupported'],
      ['bin', 'unsupported'],
      ['pdf', 'unsupported'],
      ['html', 'unsupported'],
      ['txt', 'unsupported'],
    ])('SMU-13 maps .%s to %s', (ext, hint) => {
      expect(inferMediaPreviewHint(ref(`.${ext}`))).toBe(hint);
      expect(
        expectValid(
          resolveSignedMediaUrl(rel({ ext: `.${ext}` }), BASE, NOW_MS),
        ).previewHint,
      ).toBe(hint);
    });

    it('SMU-14 treats names without a usable extension as unsupported and is case-insensitive', () => {
      expect(inferMediaPreviewHint('noextension')).toBe('unsupported');
      expect(inferMediaPreviewHint('trailingdot.')).toBe('unsupported');
      expect(inferMediaPreviewHint('.jpg')).toBe('unsupported');
      expect(inferMediaPreviewHint('a.JPG')).toBe('image');
    });
  });

  describe('expiry (backend Unix-second semantics: expired iff floor(now/1000) > exp)', () => {
    const url = rel();

    it('SMU-15 is valid at exactly exp seconds with zero remaining', () => {
      const result = expectValid(
        resolveSignedMediaUrl(url, BASE, EXP * 1000),
      );

      expect(result.remainingSeconds).toBe(0);
    });

    it('SMU-16 is still valid for the rest of the exp second (floor semantics)', () => {
      expect(
        resolveSignedMediaUrl(url, BASE, EXP * 1000 + 999).status,
      ).toBe('valid');
      expect(
        resolveSignedMediaUrl(url, BASE, EXP * 1000 + 999.9).status,
      ).toBe('valid');
    });

    it('SMU-17 is expired from exp + 1 second', () => {
      const result = resolveSignedMediaUrl(url, BASE, (EXP + 1) * 1000);

      expectRejected(result, 'expired', 'media-url-expired');
      expect(result.remainingSeconds).toBe(0);
      expect(result.mediaRef).toBe(ref());
      expect(result.expiresAtUnixSeconds).toBe(EXP);
    });

    it('SMU-18 reports remaining seconds before expiry', () => {
      expect(
        expectValid(resolveSignedMediaUrl(url, BASE, (EXP - 1) * 1000))
          .remainingSeconds,
      ).toBe(1);
      expect(
        expectValid(resolveSignedMediaUrl(url, BASE, (EXP - 1) * 1000 + 1))
          .remainingSeconds,
      ).toBe(1);
    });

    it('SMU-19 treats exp=0 and exp=1 as expired', () => {
      expect(
        resolveSignedMediaUrl(rel({ exp: 0 }), BASE, NOW_MS).status,
      ).toBe('expired');
      expect(
        resolveSignedMediaUrl(rel({ exp: 1 }), BASE, NOW_MS).status,
      ).toBe('expired');
    });

    it('SMU-20 handles a negative clock without throwing', () => {
      expect(resolveSignedMediaUrl(url, BASE, -1).status).toBe('valid');
    });

    it('SMU-21 accepts very large expiry values up to int64 max without losing precision in the decision', () => {
      const inDateRange = expectValid(
        resolveSignedMediaUrl(
          rel({ exp: '8640000000000' }),
          BASE,
          NOW_MS,
        ),
      );

      expect(inDateRange.expiresAt).toEqual(new Date(8_640_000_000_000_000));

      const beyondDateRange = expectValid(
        resolveSignedMediaUrl(
          rel({ exp: '8640000000001' }),
          BASE,
          NOW_MS,
        ),
      );

      expect(beyondDateRange.expiresAt).toBeNull();
      expect(beyondDateRange.expiresAtUnixSeconds).toBe(8_640_000_000_001);

      const int64Max = expectValid(
        resolveSignedMediaUrl(
          rel({ exp: '9223372036854775807' }),
          BASE,
          NOW_MS,
        ),
      );

      expect(int64Max.expiresAt).toBeNull();
      expect(int64Max.expiresAtUnixSeconds).toBe(Number.MAX_SAFE_INTEGER);
      expect(int64Max.remainingSeconds).toBe(Number.MAX_SAFE_INTEGER);
    });

    it.each([
      '',
      'abc',
      '-1',
      '+1',
      '1.5',
      '01',
      '1e9',
      '0x10',
      '9223372036854775808',
      '99999999999999999999',
    ])('SMU-22 rejects invalid expiry %j', exp => {
      expectRejected(
        resolveSignedMediaUrl(
          `/api/v1/media/${ref()}?exp=${exp}&sig=${SIG}`,
          BASE,
          NOW_MS,
        ),
        'malformed',
        'invalid-expiry',
      );
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'SMU-23 rejects invalid clock value %s',
      now => {
        expectRejected(
          resolveSignedMediaUrl(rel(), BASE, now),
          'malformed',
          'invalid-clock-time',
        );
      },
    );

    it('SMU-24 reports unconfigured before validating the clock or the URL', () => {
      expectRejected(
        resolveSignedMediaUrl('http://evil.test', null, Number.NaN),
        'unconfigured',
        'api-base-url-not-configured',
      );
    });
  });

  describe('scheme and origin rejection', () => {
    it.each([
      `http://api.fixora.test${rel()}`,
      `HTTP://api.fixora.test${rel()}`,
    ])('SMU-25 rejects HTTP: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'untrusted',
        'insecure-scheme',
      );
    });

    it.each([
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///etc/passwd',
      'ftp://api.fixora.test/x',
      'blob:https://api.fixora.test/abc',
      'ws://api.fixora.test/x',
      'mailto:a@b.test',
    ])('SMU-26 rejects unsupported scheme %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'untrusted',
        'unsupported-scheme',
      );
    });

    it('SMU-27 rejects protocol-relative URLs', () => {
      expectRejected(
        resolveSignedMediaUrl(`//api.fixora.test${rel()}`, BASE, NOW_MS),
        'untrusted',
        'protocol-relative-url',
      );
      expectRejected(
        resolveSignedMediaUrl(`//evil.test${rel()}`, BASE, NOW_MS),
        'untrusted',
        'protocol-relative-url',
      );
    });

    it.each([
      `https://user:pass@api.fixora.test${rel()}`,
      `https://user@api.fixora.test${rel()}`,
      `https://@api.fixora.test${rel()}`,
      `https://api.fixora.test@evil.test${rel()}`,
      `https://api.fixora.test:443@evil.test${rel()}`,
    ])('SMU-28 rejects embedded credentials: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'untrusted',
        'embedded-credentials',
      );
    });

    it.each([
      `https://evil.test${rel()}`,
      `https://api.fixora.test.evil.test${rel()}`,
      `https://evil-api.fixora.test${rel()}`,
      `https://sub.api.fixora.test${rel()}`,
      `https://api.fixora.test.${rel()}`,
      `https://api.fixora.test:8443${rel()}`,
      `https://127.0.0.1${rel()}`,
    ])('SMU-29 rejects untrusted origin %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'untrusted',
        'untrusted-origin',
      );
    });

    it('SMU-30 rejects a non-default port when the trusted origin has none and vice versa', () => {
      expectRejected(
        resolveSignedMediaUrl(
          `${BASE}${rel()}`,
          'https://api.fixora.test:8443',
          NOW_MS,
        ),
        'untrusted',
        'untrusted-origin',
      );
    });

    it.each([
      `https://API.FIXORA.TEST${rel()}`,
      `https://api.fixora.test:443${rel()}`,
      `https://api%2efixora.test${rel()}`,
    ])('SMU-31 rejects ambiguous hostname normalization %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'ambiguous-url-normalization',
      );
    });

    it.each([
      `https:api.fixora.test${rel()}`,
      `https:/api.fixora.test${rel()}`,
    ])('SMU-32 rejects non-canonical https prefix %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'ambiguous-url-normalization',
      );
    });

    it('SMU-33 rejects an absolute URL with no path or with the query directly after the host', () => {
      expectRejected(
        resolveSignedMediaUrl(BASE, BASE, NOW_MS),
        'malformed',
        'unexpected-path',
      );
      expectRejected(
        resolveSignedMediaUrl(`${BASE}?exp=${EXP}&sig=${SIG}`, BASE, NOW_MS),
        'malformed',
        'unexpected-path',
      );
    });
  });

  describe('raw character rejection', () => {
    it.each([
      `${rel()}#fragment`,
      `${rel()}#`,
      `${BASE}${rel()}#x`,
    ])('SMU-34 rejects fragments: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'fragment-not-allowed',
      );
    });

    it.each([
      `/api/v1/media\\${ref()}?exp=${EXP}&sig=${SIG}`,
      `\\api\\v1\\media\\${ref()}?exp=${EXP}&sig=${SIG}`,
      `https:\\\\api.fixora.test${rel()}`,
      `\\\\api.fixora.test${rel()}`,
      `/\\api.fixora.test${rel()}`,
    ])('SMU-35 rejects backslashes: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'backslash-not-allowed',
      );
    });

    it.each([
      ` ${rel()}`,
      `${rel()} `,
      `${rel()}\n`,
      `\t${rel()}`,
      `${rel()}\r\n`,
      `/api/v1/media/${ref()}?exp=${EXP}&sig=${SIG}\u0000`,
      `\u00a0${rel()}`,
      `${rel()}\u2028`,
    ])('SMU-36 rejects whitespace and control characters (%j)', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'invalid-characters',
      );
    });

    it.each([
      `/api/v1/media/%2e%2e/${ref()}?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${HEX32}%2ejpg?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${HEX32}%2fjpg?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${HEX32}%5cjpg?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${ref()}?exp=${EXP}&sig=%61${SIG.slice(1)}`,
      `/api/v1/media/${ref()}?exp=%31${EXP}&sig=${SIG}`,
      `/api/v1/media/${ref()}%00?exp=${EXP}&sig=${SIG}`,
      `${BASE}/api/v1/media/%2E%2E/${ref()}?exp=${EXP}&sig=${SIG}`,
    ])('SMU-37 rejects percent-encoded characters: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'encoded-characters-not-allowed',
      );
    });

    it.each([
      `/api/v1/media/../${ref()}?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${ref()}/../x?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/..${ref()}?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${HEX32}..jpg?exp=${EXP}&sig=${SIG}`,
      `/api/v1/../v1/media/${ref()}?exp=${EXP}&sig=${SIG}`,
      `${BASE}/api/v1/media/../${ref()}?exp=${EXP}&sig=${SIG}`,
    ])('SMU-38 rejects path traversal: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'path-traversal',
      );
    });
  });

  describe('path and media reference rejection', () => {
    it.each([
      `/api/v2/media/${ref()}?exp=${EXP}&sig=${SIG}`,
      `/api/v1/Media/${ref()}?exp=${EXP}&sig=${SIG}`,
      `/media/${ref()}?exp=${EXP}&sig=${SIG}`,
      `api/v1/media/${ref()}?exp=${EXP}&sig=${SIG}`,
      `${ref()}?exp=${EXP}&sig=${SIG}`,
      `/api/v1/mediax/${ref()}?exp=${EXP}&sig=${SIG}`,
      `/other/api/v1/media/${ref()}?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media/${ref()}/extra?exp=${EXP}&sig=${SIG}`,
      `/api/v1/media//${ref()}?exp=${EXP}&sig=${SIG}`,
      `${BASE}/other/${ref()}?exp=${EXP}&sig=${SIG}`,
    ])('SMU-39 rejects unexpected path: %s', input => {
      expectRejected(
        resolveSignedMediaUrl(input, BASE, NOW_MS),
        'malformed',
        'unexpected-path',
      );
    });

    it.each([
      ['uppercase hex', `${HEX32.toUpperCase()}.jpg`],
      ['31 hex characters', `${HEX32.slice(1)}.jpg`],
      ['33 hex characters', `${HEX32}0.jpg`],
      ['non-hex characters', `${'z'.repeat(32)}.jpg`],
      ['no extension', HEX32],
      ['empty extension', `${HEX32}.`],
      ['uppercase extension', `${HEX32}.JPG`],
      ['6 character extension', `${HEX32}.abcdef`],
      ['double extension', `${HEX32}.tar.gz`],
      ['hyphen-prefixed name', `-${HEX32.slice(1)}.jpg`],
      ['plain file name', 'photo.jpg'],
    ])('SMU-40 rejects invalid media reference (%s)', (_label, mediaRef) => {
      expectRejected(
        resolveSignedMediaUrl(
          `/api/v1/media/${mediaRef}?exp=${EXP}&sig=${SIG}`,
          BASE,
          NOW_MS,
        ),
        'malformed',
        'invalid-media-ref',
      );
    });

    it.each([
      '.j+g',
      '.j~g',
      '.j!g',
      '.j$g',
      '.j,g',
      '.j;g',
      '.j=g',
      '.j:g',
      '.j@g',
      '.j(g',
      '.j*g',
      '.j\'g',
      '.j"g',
      '.j<g',
      '.j|g',
      '.\u00e9',
      '.\u4e2d',
    ])(
      'SMU-41 deliberately rejects unusual extension %j as a frontend safety restriction (backend would accept it)',
      ext => {
        expectRejected(
          resolveSignedMediaUrl(
            `/api/v1/media/${HEX32}${ext}?exp=${EXP}&sig=${SIG}`,
            BASE,
            NOW_MS,
          ),
          'malformed',
          'invalid-media-ref',
        );
      },
    );
  });

  describe('query rejection', () => {
    it('SMU-42 rejects a missing, empty or incomplete query', () => {
      const path = `/api/v1/media/${ref()}`;

      expectRejected(
        resolveSignedMediaUrl(path, BASE, NOW_MS),
        'malformed',
        'missing-query',
      );
      expectRejected(
        resolveSignedMediaUrl(`${path}?`, BASE, NOW_MS),
        'malformed',
        'missing-query',
      );
      expectRejected(
        resolveSignedMediaUrl(`${path}?exp=${EXP}`, BASE, NOW_MS),
        'malformed',
        'missing-query',
      );
      expectRejected(
        resolveSignedMediaUrl(`${path}?sig=${SIG}`, BASE, NOW_MS),
        'malformed',
        'missing-query',
      );
    });

    it.each([
      `exp=${EXP}&sig=${SIG}&extra=1`,
      `extra=1&exp=${EXP}&sig=${SIG}`,
      `exp=${EXP}&sig=${SIG}&`,
      `exp=${EXP}&&sig=${SIG}`,
      `&exp=${EXP}&sig=${SIG}`,
      `EXP=${EXP}&sig=${SIG}`,
      `exp=${EXP}&SIG=${SIG}`,
      `exp=${EXP}&sig`,
      `exp&sig=${SIG}`,
      `=1&exp=${EXP}&sig=${SIG}`,
      `exp=${EXP}=1&sig=${SIG}`,
      `exp=${EXP};sig=${SIG}`,
      `exp=${EXP}&sig=${SIG}?x=1`,
    ])('SMU-43 rejects unexpected query shape: %s', query => {
      expectRejected(
        resolveSignedMediaUrl(
          `/api/v1/media/${ref()}?${query}`,
          BASE,
          NOW_MS,
        ),
        'malformed',
        'unexpected-query-parameter',
      );
    });

    it.each([
      `exp=${EXP}&exp=${EXP}&sig=${SIG}`,
      `exp=${EXP}&sig=${SIG}&exp=${EXP + 1}`,
      `exp=${EXP}&sig=${SIG}&sig=${SIG}`,
      `sig=${SIG}&sig=${'b2'.repeat(32)}&exp=${EXP}`,
    ])('SMU-44 rejects duplicate query parameters: %s', query => {
      expectRejected(
        resolveSignedMediaUrl(
          `/api/v1/media/${ref()}?${query}`,
          BASE,
          NOW_MS,
        ),
        'malformed',
        'duplicate-query-parameter',
      );
    });

    it.each([
      ['empty', ''],
      ['63 characters', SIG.slice(1)],
      ['65 characters', `${SIG}a`],
      ['uppercase hex', SIG.toUpperCase()],
      ['mixed case hex', `A${SIG.slice(1)}`],
      ['non-hex character', `g${SIG.slice(1)}`],
      ['0x prefix', `0x${SIG.slice(2)}`],
      ['base64 style', 'Ab+/'.repeat(11)],
    ])('SMU-45 rejects invalid signature (%s)', (_label, sig) => {
      expectRejected(
        resolveSignedMediaUrl(
          `/api/v1/media/${ref()}?exp=${EXP}&sig=${sig}`,
          BASE,
          NOW_MS,
        ),
        'malformed',
        'invalid-signature',
      );
    });

    it('SMU-46 validates expiry before signature', () => {
      expectRejected(
        resolveSignedMediaUrl(
          `/api/v1/media/${ref()}?exp=abc&sig=bad`,
          BASE,
          NOW_MS,
        ),
        'malformed',
        'invalid-expiry',
      );
    });
  });

  describe('input and configuration handling', () => {
    it.each([
      [null],
      [undefined],
      [123],
      [true],
      [{}],
      [[]],
      [['/api/v1/media/x']],
      [''],
    ])(
      'SMU-47 rejects non-string or empty input %j as malformed without throwing',
      (input: unknown) => {
        expectRejected(
          resolveSignedMediaUrl(input, BASE, NOW_MS),
          'malformed',
          'empty-url',
        );
      },
    );

    it.each([null, undefined, '', '   '])(
      'SMU-48 returns unconfigured for a missing base URL (%j)',
      base => {
        const result = resolveSignedMediaUrl(rel(), base, NOW_MS);

        expectRejected(result, 'unconfigured', 'api-base-url-not-configured');
        expect(result.mediaRef).toBeNull();
        expect(result.previewHint).toBe('unsupported');
      },
    );

    it.each([
      'not a url',
      'http://api.fixora.test',
      'ftp://api.fixora.test',
      'https://user:pw@api.fixora.test',
      'https://api.fixora.test/?x=1',
      'https://api.fixora.test/#frag',
    ])('SMU-49 returns unconfigured for an invalid base URL %s', base => {
      expectRejected(
        resolveSignedMediaUrl(rel(), base, NOW_MS),
        'unconfigured',
        'invalid-api-base-url',
      );
    });

    it('SMU-50 never accepts a trusted-looking URL when the base is http', () => {
      expectRejected(
        resolveSignedMediaUrl(
          'http://api.fixora.test/api/v1/media/x',
          'http://api.fixora.test',
          NOW_MS,
        ),
        'unconfigured',
        'invalid-api-base-url',
      );
    });
  });

  describe('safe messages', () => {
    const SECRET_USER = 'secretuser';
    const SECRET_PASS = 'secretpass';
    const SECRET_SIG = 'c3'.repeat(32);
    const SECRET_HOST = 'attacker.example';

    const hostile: readonly string[] = [
      `http://${SECRET_HOST}${rel({ sig: SECRET_SIG })}`,
      `https://${SECRET_HOST}${rel({ sig: SECRET_SIG })}`,
      `https://${SECRET_USER}:${SECRET_PASS}@api.fixora.test${rel({ sig: SECRET_SIG })}`,
      `//${SECRET_HOST}${rel({ sig: SECRET_SIG })}`,
      `${rel({ sig: SECRET_SIG })}#frag`,
      `/api/v1/media/%2e%2e/${ref()}?exp=${EXP}&sig=${SECRET_SIG}`,
      `/api/v1/media/${ref()}?exp=${EXP}&sig=${SECRET_SIG}&x=1`,
      `/api/v1/media/${ref()}?exp=${EXP}&sig=${SECRET_SIG.toUpperCase()}`,
      `/api/v1/media/${ref()}?exp=${EXP}&sig=${SECRET_SIG}${SECRET_SIG}`,
      `javascript:alert('${SECRET_SIG}')`,
      rel({ sig: SECRET_SIG, exp: 1 }),
      rel({ sig: SECRET_SIG }),
    ];

    it('SMU-51 rejected results never echo the raw URL, signature, credentials or foreign host', () => {
      for (const input of hostile) {
        const result = resolveSignedMediaUrl(input, BASE, EXP * 1000 + 5000);

        if (result.ok) {
          continue;
        }

        const serialized = JSON.stringify(result);

        expect(result.url).toBeNull();
        expect(serialized).not.toContain(input);
        expect(serialized.toLowerCase()).not.toContain(SECRET_SIG);
        expect(serialized).not.toContain(SECRET_USER);
        expect(serialized).not.toContain(SECRET_PASS);
        expect(serialized).not.toContain(SECRET_HOST);
        expect(result.message).toEqual(expect.any(String));
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.message).not.toMatch(/https?:|exp=|sig=|\/api\//i);
      }
    });

    it('SMU-52 expired results expose no URL and no signature', () => {
      const result = resolveSignedMediaUrl(
        rel({ sig: SECRET_SIG }),
        BASE,
        (EXP + 10) * 1000,
      );
      const serialized = JSON.stringify(result);

      expect(result.status).toBe('expired');
      expect(result.url).toBeNull();
      expect(serialized).not.toContain(SECRET_SIG);
      expect(serialized).not.toContain('sig=');
    });

    it('SMU-53 uses a small fixed set of generic messages per status', () => {
      const statuses = new Map<string, Set<string>>();
      const inputs: readonly unknown[] = [
        ...hostile,
        null,
        `/api/v1/media/${ref()}`,
        `http://x.test${rel()}`,
      ];

      for (const input of inputs) {
        const result = resolveSignedMediaUrl(input, BASE, EXP * 1000 + 5000);

        if (!result.ok) {
          const set = statuses.get(result.status) ?? new Set<string>();

          set.add(result.message);
          statuses.set(result.status, set);
        }
      }

      for (const messages of statuses.values()) {
        expect(messages.size).toBe(1);
      }

      const config = resolveSignedMediaUrl(rel(), null, NOW_MS);

      expect(config.message).toBeTruthy();
      expect(config.message).not.toContain('https');
    });
  });
});
