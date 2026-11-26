import { inject, Injectable } from '@angular/core';

import { API_CONFIG } from './api.config';

@Injectable({
  providedIn: 'root',
})
export class ApiUrlService {
  private readonly config = inject(API_CONFIG);

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl?.trim());
  }

  resolve(path: string): string {
    const baseUrl = this.config.baseUrl?.trim();

    if (!baseUrl) {
      throw new Error('FIXORA API base URL is not configured');
    }

    const base = new URL(baseUrl);

    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      throw new Error('Invalid API base URL');
    }

    const endpoint = path.trim().replace(/^\/+/, '');

    if (
      !endpoint ||
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(endpoint)
    ) {
      throw new Error('Invalid API endpoint path');
    }

    return `${base.href.replace(/\/+$/, '')}/${endpoint}`;
  }
}
