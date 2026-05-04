import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { PaginatedResponse, SetupResponse } from './api-types';

@Injectable({
  providedIn: 'root'
})
export class SetupsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  list(page = 0, size = 100, symbol?: string): Observable<PaginatedResponse<SetupResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (symbol && symbol.trim().length > 0) {
      params = params.set('symbol', symbol.trim());
    }

    return this.http.get<PaginatedResponse<SetupResponse>>(
      `${this.apiConfig.baseUrl}/api/v1/setups`,
      { params }
    );
  }
}
