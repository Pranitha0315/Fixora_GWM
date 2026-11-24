import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import {
  API_CONFIG,
  DEFAULT_API_CONFIG,
} from './core/config/api.config';

import { AUTH_GATEWAY } from './core/auth/auth-gateway';
import { HttpAuthGateway } from './core/auth/http-auth.gateway';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    {
      provide: API_CONFIG,
      useValue: {
        ...DEFAULT_API_CONFIG,
        baseUrl: environment.apiBaseUrl,
      },
    },
    {
      provide: AUTH_GATEWAY,
      useExisting: HttpAuthGateway,
    },
  ],
};
