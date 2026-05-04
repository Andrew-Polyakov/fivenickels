export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface StockResponse {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  isActive: boolean;
}

export interface SetupResponse {
  id: number;
  runId: number;
  symbol: string;
  setupType: string;
  direction: string | null;
  confluence: string | null;
  score: string | null;
}

export interface HealthResponse {
  status: string;
}
