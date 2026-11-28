import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SessionService } from '../../../core/auth/session.service';
import { API_CONFIG } from '../../../core/config/api.config';
import type { ApiConfig } from '../../../core/config/api.config';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';

import {
  SIGNED_MEDIA_CLOCK,
  SignedMediaUrlService,
} from './signed-media-url.service';

/**
 * Structure, origin and expiry only. HMAC authenticity is verified by the
 * backend, never by this service.
 */

const BASE = 'https://api.fixora.test';
const HEX32 = '0123456789abcdef0123456789abcdef';
const SIG = 'a1'.repeat(32);
const EXP = 1_800_000_900;

function rel(ext = '.jpg', exp: number = EXP): string {
  return `/api/v1/media/${HEX32}${ext}?exp=${exp}&sig=${SIG}`;
}

describe('SignedMediaUrlService', () => {
  let clockCalls: number;
  let clockValueMs: number;

  function configure(
    config: ApiConfig,
    options?: { readonly clock?: () => number },
  ): SignedMediaUrlService {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: config },
        {
          provide: SIGNED_MEDIA_CLOCK,
          useValue:
            options?.clock ??
            (() => {
              clockCalls += 1;

              return clockValueMs;
            }),
        },
      ],
    });

    return TestBed.inject(SignedMediaUrlService);
  }

  beforeEach(() => {
    clockCalls = 0;
    clockValueMs = (EXP - 900) * 1000;
  });

  describe('API_CONFIG injection', () => {
    it('SMS-01 resolves against the injected trusted API origin', () => {
      const service = configure({ baseUrl: BASE });
      const result = service.resolve(rel());

      expect(result.ok).toBe(true);
      expect(result.url).toBe(`${BASE}${rel()}`);
    });

    it('SMS-02 follows a different injected origin and ignores the path prefix', () => {
      const service = configure({
        baseUrl: 'https://other.fixora.test:8443/gateway',
      });

      expect(service.resolve(rel()).url).toBe(
        `https://other.fixora.test:8443${rel()}`,
      );
      expect(
        service.resolve(`https://api.fixora.test${rel()}`).reason,
      ).toBe('untrusted-origin');
    });

    it('SMS-03 does not fall back to window.location or any default origin', () => {
      const service = configure({ baseUrl: null });
      const result = service.resolve(rel());

      expect(result.status).toBe('unconfigured');
      expect(result.url).toBeNull();
    });
  });

  describe('isOriginConfigured', () => {
    it('SMS-04 is true for a valid https base URL', () => {
      expect(configure({ baseUrl: BASE }).isOriginConfigured()).toBe(true);
    });

    it.each([
      null,
      '',
      '   ',
      'not a url',
      'http://api.fixora.test',
      'https://user:pw@api.fixora.test',
      'https://api.fixora.test/?x=1',
    ])('SMS-05 is false for base URL %j', baseUrl => {
      expect(configure({ baseUrl }).isOriginConfigured()).toBe(false);
    });
  });

  describe('SIGNED_MEDIA_CLOCK', () => {
    it('SMS-06 defaults to the real wall clock', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: API_CONFIG, useValue: { baseUrl: BASE } }],
      });

      const clock = TestBed.inject(SIGNED_MEDIA_CLOCK);
      const before = Date.now();
      const value = clock();
      const after = Date.now();

      expect(value).toBeGreaterThanOrEqual(before);
      expect(value).toBeLessThanOrEqual(after);

      const service = TestBed.inject(SignedMediaUrlService);

      expect(service.resolve(rel('.jpg', 1)).status).toBe('expired');
      expect(
        service.resolve(rel('.jpg', Math.floor(Date.now() / 1000) + 3600))
          .status,
      ).toBe('valid');
    });

    it('SMS-07 uses the injected clock and honours Unix-second boundaries', () => {
      const service = configure({ baseUrl: BASE });

      clockValueMs = EXP * 1000 + 999;
      expect(service.resolve(rel()).status).toBe('valid');

      clockValueMs = (EXP + 1) * 1000;
      expect(service.resolve(rel()).status).toBe('expired');
      expect(clockCalls).toBe(2);
    });

    it('SMS-08 an explicit nowMs overrides the injected clock without reading it', () => {
      const service = configure({ baseUrl: BASE });

      clockValueMs = (EXP + 100) * 1000;

      expect(service.resolve(rel(), (EXP - 10) * 1000).status).toBe('valid');
      expect(service.resolve(rel(), (EXP + 1) * 1000).status).toBe('expired');
      expect(clockCalls).toBe(0);
    });

    it('SMS-09 an explicit nowMs of 0 is respected rather than treated as missing', () => {
      const service = configure({ baseUrl: BASE });

      clockValueMs = (EXP + 100) * 1000;

      expect(service.resolve(rel(), 0).status).toBe('valid');
      expect(clockCalls).toBe(0);
    });

    it('SMS-10 reports an invalid clock value as malformed without throwing', () => {
      const service = configure(
        { baseUrl: BASE },
        { clock: () => Number.NaN },
      );
      const result = service.resolve(rel());

      expect(result.status).toBe('malformed');
      expect(result.reason).toBe('invalid-clock-time');
      expect(service.resolve(rel(), Number.POSITIVE_INFINITY).reason).toBe(
        'invalid-clock-time',
      );
    });
  });

  describe('resolve', () => {
    it('SMS-11 returns valid results with preserved URL, hint and expiry', () => {
      const service = configure({ baseUrl: BASE });
      const result = service.resolve(rel('.mp4'));

      expect(result.status).toBe('valid');

      if (result.ok) {
        expect(result.url).toBe(`${BASE}${rel('.mp4')}`);
        expect(result.previewHint).toBe('video');
        expect(result.remainingSeconds).toBe(900);
        expect(result.expiresAtUnixSeconds).toBe(EXP);
      }
    });

    it.each([
      [null],
      [undefined],
      [42],
      [{}],
      [[]],
      [''],
      ['http://api.fixora.test/api/v1/media/x'],
      ['javascript:alert(1)'],
      [`${rel()}#x`],
      [`https://evil.test${rel()}`],
    ])('SMS-12 handles invalid input %j safely', (input: unknown) => {
      const service = configure({ baseUrl: BASE });
      const result = service.resolve(input);

      expect(result.ok).toBe(false);
      expect(result.url).toBeNull();
      expect(result.message).toEqual(expect.any(String));
    });

    it('SMS-13 never leaks the raw URL or signature through results', () => {
      const service = configure({ baseUrl: BASE });
      const input = `https://evil.test${rel()}`;
      const serialized = JSON.stringify(service.resolve(input));

      expect(serialized).not.toContain(SIG);
      expect(serialized).not.toContain('evil.test');
      expect(serialized).not.toContain(input);
    });

    it('SMS-14 does not throw for unconfigured origins', () => {
      const service = configure({ baseUrl: 'http://insecure.test' });

      expect(() => service.resolve(rel())).not.toThrow();
      expect(service.resolve(rel()).reason).toBe('invalid-api-base-url');
    });
  });

  describe('resolveAll', () => {
    it('SMS-15 resolves in order with a single consistent clock reading', () => {
      const rolling = [
        (EXP - 10) * 1000,
        (EXP + 100) * 1000,
        (EXP + 200) * 1000,
      ];
      let calls = 0;
      const service = configure(
        { baseUrl: BASE },
        {
          clock: () => {
            const value = rolling[Math.min(calls, rolling.length - 1)];

            calls += 1;

            return value;
          },
        },
      );

      const results = service.resolveAll([
        rel('.jpg'),
        rel('.mp3'),
        rel('.png'),
        rel('.webm'),
      ]);

      expect(calls).toBe(1);
      expect(results.map(result => result.status)).toEqual([
        'valid',
        'valid',
        'valid',
        'valid',
      ]);
      expect(results.map(result => result.previewHint)).toEqual([
        'image',
        'audio',
        'image',
        'video',
      ]);
    });

    it('SMS-16 an explicit nowMs bypasses the clock for the whole list', () => {
      const service = configure({ baseUrl: BASE });
      const results = service.resolveAll(
        [rel('.jpg', EXP), rel('.jpg', EXP - 10)],
        (EXP - 5) * 1000,
      );

      expect(clockCalls).toBe(0);
      expect(results.map(result => result.status)).toEqual([
        'valid',
        'expired',
      ]);
    });

    it('SMS-17 handles mixed, invalid and empty lists without throwing', () => {
      const service = configure({ baseUrl: BASE });
      const results = service.resolveAll([
        rel(),
        null,
        `http://api.fixora.test${rel()}`,
        `https://evil.test${rel()}`,
        `${rel()}#x`,
        rel('.jpg', 1),
      ]);

      expect(results.map(result => result.status)).toEqual([
        'valid',
        'malformed',
        'untrusted',
        'untrusted',
        'malformed',
        'expired',
      ]);
      expect(service.resolveAll([])).toEqual([]);
    });

    it('SMS-18 returns unconfigured for every item when the origin is not configured', () => {
      const service = configure({ baseUrl: null });
      const results = service.resolveAll([rel(), rel('.mp4')]);

      expect(results.map(result => result.status)).toEqual([
        'unconfigured',
        'unconfigured',
      ]);
    });
  });

  describe('no HTTP and no bearer token', () => {
    it('SMS-19 never issues HTTP requests or attaches a bearer token', () => {
      const service = configure({ baseUrl: BASE });
      const session = TestBed.inject(SessionService);
      const http = TestBed.inject(HttpTestingController);

      session.setSession({
        accessToken: 'test-access-token',
        expiresAt: Date.now() + 60_000,
        user: {
          id: 'test-manager-001',
          displayName: 'Test Manager',
          email: 'manager@example.test',
          roles: ['Manager'],
        },
      });

      const single = service.resolve(rel());
      const many = service.resolveAll([rel(), rel('.mp4')]);

      expect(service.isOriginConfigured()).toBe(true);
      http.expectNone(() => true);
      http.verify();

      const urls = [single, ...many].map(result => result.url ?? '');

      for (const url of urls) {
        expect(url).not.toContain('test-access-token');
        expect(url.toLowerCase()).not.toContain('bearer');
        expect(url.toLowerCase()).not.toContain('access_token');
        expect(url).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);
      }
    });
  });
});
