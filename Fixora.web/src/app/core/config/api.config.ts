import { InjectionToken } from '@angular/core';

export interface ApiConfig {
  readonly baseUrl: string | null;
}

export const API_CONFIG = new InjectionToken<ApiConfig>(
  'FIXORA_API_CONFIG',
);

export const DEFAULT_API_CONFIG: ApiConfig = {
  baseUrl: null,
};
