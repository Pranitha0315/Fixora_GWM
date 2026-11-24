import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { firstValueFrom } from 'rxjs';

import { HttpAuthGateway } from './http-auth.gateway';
import { API_CONFIG } from '../config/api.config';
import { SKIP_AUTH } from '../interceptors/auth.interceptor';

describe('HttpAuthGateway', () => {
  let gateway: HttpAuthGateway;
  let controller: HttpTestingController;

  const endpoint =
    'https://localhost:7080/api/v1/manager/auth/login';

  const credentials = {
    email: 'manager@example.test',
    password: 'test-password',
  };

  const validResponse = () => ({
    accessToken: 'test-access-token',
    accessTokenExpiresAt:
      new Date(Date.now() + 60000).toISOString(),
    refreshToken: 'test-refresh-token',
    refreshTokenExpiresAt:
      new Date(Date.now() + 3600000).toISOString(),
    userId: 'test-manager-001',
    role: 'Manager',
    name: 'Test Manager',
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: API_CONFIG,
          useValue: {
            baseUrl: 'https://localhost:7080',
          },
        },
      ],
    });

    gateway = TestBed.inject(HttpAuthGateway);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
  });

  it('GW-01 creates the gateway', () => {
    expect(gateway).toBeTruthy();
  });

  it('GW-02 sends the correct HTTPS login request', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    const request = controller.expectOne(endpoint);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(credentials);

    request.flush(validResponse());

    await result;
  });

  it('GW-03 skips authentication on login requests', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    const request = controller.expectOne(endpoint);

    expect(request.request.context.get(SKIP_AUTH))
      .toBe(true);

    request.flush(validResponse());

    await result;
  });

  it('GW-04 maps a valid manager session', async () => {
    const response = validResponse();

    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush(response);

    const session = await result;

    expect(session.accessToken)
      .toBe(response.accessToken);

    expect(session.expiresAt)
      .toBe(Date.parse(response.accessTokenExpiresAt));

    expect(session.user.id).toBe(response.userId);
    expect(session.user.displayName).toBe(response.name);
    expect(session.user.email).toBe(credentials.email);
    expect(session.user.roles).toEqual(['Manager']);

    expect(session).not.toHaveProperty('refreshToken');
  });

  it('GW-05 accepts the owner role', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({
      ...validResponse(),
      role: 'Owner',
    });

    expect((await result).user.roles)
      .toEqual(['Owner']);
  });

  it('GW-06 rejects unauthorized roles', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({
      ...validResponse(),
      role: 'Mechanic',
    });

    await expect(result).rejects.toThrow(
      'Access to Manager Portal is not permitted',
    );
  });

  it('GW-07 rejects expired access tokens', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({
      ...validResponse(),
      accessTokenExpiresAt:
        new Date(Date.now() - 60000).toISOString(),
    });

    await expect(result).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('GW-08 rejects malformed expiry dates', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({
      ...validResponse(),
      accessTokenExpiresAt: 'invalid-date',
    });

    await expect(result).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('GW-09 rejects empty access tokens', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({
      ...validResponse(),
      accessToken: '',
    });

    await expect(result).rejects.toThrow(
      'Invalid authentication response',
    );
  });

  it('GW-10 rejects missing user identity', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({
      ...validResponse(),
      userId: '',
    });

    await expect(result).rejects.toThrow(
      'Invalid authentication response',
    );
  });

  it('GW-11 rejects incomplete backend responses', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush({});

    await expect(result).rejects.toThrow(
      'Invalid authentication response',
    );
  });

  it('GW-12 propagates invalid credentials errors', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).flush(
      {},
      {
        status: 401,
        statusText: 'Unauthorized',
      },
    );

    await expect(result).rejects.toMatchObject({
      status: 401,
    });
  });

  it('GW-13 handles network failures', async () => {
    const result = firstValueFrom(
      gateway.login(credentials),
    );

    controller.expectOne(endpoint).error(
      new ProgressEvent('error'),
    );

    await expect(result).rejects.toMatchObject({
      status: 0,
    });
  });

  it('GW-14 trims email but preserves password', async () => {
    const result = firstValueFrom(
      gateway.login({
        email: '  manager@example.test  ',
        password: ' test-password ',
      }),
    );

    const request = controller.expectOne(endpoint);

    expect(request.request.body).toEqual({
      email: 'manager@example.test',
      password: ' test-password ',
    });

    request.flush(validResponse());

    await result;
  });
});
