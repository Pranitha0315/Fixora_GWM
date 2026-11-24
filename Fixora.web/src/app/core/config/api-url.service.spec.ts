import { TestBed } from '@angular/core/testing';

import { API_CONFIG } from './api.config';
import { ApiUrlService } from './api-url.service';

describe('ApiUrlService', () => {
  const createService = (
    baseUrl: string | null,
  ): ApiUrlService => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: API_CONFIG,
          useValue: { baseUrl },
        },
      ],
    });

    return TestBed.inject(ApiUrlService);
  };

  it('should detect configured API URL', () => {
    const service = createService('https://api.example.test');

    expect(service.isConfigured()).toBe(true);
  });

  it('should detect missing API configuration', () => {
    const service = createService(null);

    expect(service.isConfigured()).toBe(false);
  });

  it('should reject requests without API configuration', () => {
    const service = createService(null);

    expect(() => service.resolve('bookings'))
      .toThrow('FIXORA API base URL is not configured');
  });

  it('should resolve a relative endpoint', () => {
    const service = createService('https://api.example.test/api');

    expect(service.resolve('bookings'))
      .toBe('https://api.example.test/api/bookings');
  });

  it('should normalize leading and trailing slashes', () => {
    const service = createService('https://api.example.test/api/');

    expect(service.resolve('/auth/login'))
      .toBe('https://api.example.test/api/auth/login');
  });

  it('should reject insecure HTTP URLs', () => {
    const service = createService('http://api.example.test');

    expect(() => service.resolve('bookings'))
      .toThrow('Invalid API base URL');
  });

  it('should reject external endpoint URLs', () => {
    const service = createService('https://api.example.test');

    expect(() =>
      service.resolve('https://external.example.test')
    ).toThrow('Invalid API endpoint path');
  });

  it('should reject empty endpoints', () => {
    const service = createService('https://api.example.test');

    expect(() => service.resolve(''))
      .toThrow('Invalid API endpoint path');
  });

  it('should reject path traversal', () => {
    const service = createService('https://api.example.test/api');

    expect(() => service.resolve('../admin'))
      .toThrow('Invalid API endpoint path');
  });

  it('should reject encoded path traversal', () => {
    const service = createService('https://api.example.test/api');

    expect(() => service.resolve('%2e%2e/admin'))
      .toThrow('Invalid API endpoint path');
  });
});
