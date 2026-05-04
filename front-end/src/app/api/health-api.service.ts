import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { HealthResponse } from './api-types';

@Injectable({
  providedIn: 'root'
})
export class HealthApiService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  check(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.apiConfig.baseUrl}/api/v1/health`);
  }
}
