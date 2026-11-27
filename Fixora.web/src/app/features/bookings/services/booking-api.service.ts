import {
  HttpClient,
  HttpParams,
} from '@angular/common/http';

import {
  inject,
  Injectable,
} from '@angular/core';

import { defer, map } from 'rxjs';
import type { Observable } from 'rxjs';

import { ApiUrlService } from '../../../core/config/api-url.service';

import {
  BOOKING_DEFAULT_PAGE_SIZE,
  BOOKING_MAX_PAGE_SIZE,
} from '../models/booking.model';

import type {
  BookingPage,
  BookingListQuery,
} from '../models/booking.model';

import {
  BookingResponseError,
  validateBookingPageResponse,
} from '../utils/booking-response.validator';

@Injectable({
  providedIn: 'root',
})
export class BookingApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(ApiUrlService);

  getBookings(
    query: BookingListQuery = {},
  ): Observable<BookingPage> {
    const date = query.date;
    const status = query.status;
    const page = query.page ?? 1;
    const pageSize =
      query.pageSize ?? BOOKING_DEFAULT_PAGE_SIZE;

    return defer(() => {
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 2147483647
      ) {
        throw new RangeError('Invalid booking page number.');
      }

      if (
        !Number.isSafeInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > BOOKING_MAX_PAGE_SIZE
      ) {
        throw new RangeError('Invalid booking page size.');
      }

      let params = new HttpParams()
        .set('page', page.toString())
        .set('pageSize', pageSize.toString());

      if (date) {
        params = params.set('date', date);
      }

      if (status) {
        params = params.set('status', status);
      }

      return this.http.get<unknown>(
        this.apiUrl.resolve('api/v1/manager/bookings'),
        { params },
      );
    }).pipe(
      map(validateBookingPageResponse),
      map(response => {
        if (response.page !== page) {
          throw new BookingResponseError('response.page');
        }

        if (response.pageSize !== pageSize) {
          throw new BookingResponseError('response.pageSize');
        }

        return response;
      }),
    );
  }
}
