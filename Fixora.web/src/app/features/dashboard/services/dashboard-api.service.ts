import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';
import type { DashboardData } from '../models/dashboard.model';
import { validateDashboardResponse } from '../utils/dashboard-response.validator';

@Injectable({
  providedIn: 'root',
})
export class DashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  getDashboard(): Observable<DashboardData> {
    return defer(() =>
      this.http.get<unknown>(
        this.apiUrl.resolve('api/v1/manager/dashboard'),
      ),
    ).pipe(map(validateDashboardResponse));
  }
}
