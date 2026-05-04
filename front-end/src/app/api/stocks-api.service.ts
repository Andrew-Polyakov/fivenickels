import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { PaginatedResponse, StockResponse } from './api-types';

@Injectable({
  providedIn: 'root'
})
export class StocksApiService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  list(page = 0, size = 30, search?: string): Observable<PaginatedResponse<StockResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search && search.trim().length > 0) {
      params = params.set('search', search.trim());
    }

    return this.http.get<PaginatedResponse<StockResponse>>(
      `${this.apiConfig.baseUrl}/api/v1/stocks`,
      { params }
    );
  }
}
