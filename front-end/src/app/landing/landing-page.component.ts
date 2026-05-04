import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { HealthApiService } from '../api/health-api.service';
import { SetupResponse, StockResponse } from '../api/api-types';
import { SetupsApiService } from '../api/setups-api.service';
import { StocksApiService } from '../api/stocks-api.service';
import {
  PanelFilters,
  SubsectionOption,
  SubsectionsPanelComponent
} from './subsections-panel.component';
import { SetupContentComponent, SetupViewModel } from './setup-content.component';
import { TickerCarouselComponent } from './ticker-carousel.component';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, TickerCarouselComponent, SubsectionsPanelComponent, SetupContentComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss'
})
export class LandingPageComponent {
  private readonly stocksApi = inject(StocksApiService);
  private readonly setupsApi = inject(SetupsApiService);
  private readonly healthApi = inject(HealthApiService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedSymbol = signal<string | null>(null);
  protected readonly filters = signal<PanelFilters>({
    setupType: null,
    direction: null,
    score: null
  });

  protected readonly stocks = signal<StockResponse[]>([]);
  protected readonly setups = signal<SetupResponse[]>([]);
  protected readonly stocksBySymbol = computed<Record<string, StockResponse>>(() =>
    this.stocks().reduce<Record<string, StockResponse>>((acc, stock) => {
      acc[stock.symbol] = stock;
      return acc;
    }, {})
  );

  protected readonly filteredSetups = computed<SetupViewModel[]>(() => {
    const filters = this.filters();
    const selectedSymbol = this.selectedSymbol();
    const stocksBySymbol = this.stocksBySymbol();

    return this.setups()
      .filter((setup) => !selectedSymbol || setup.symbol === selectedSymbol)
      .filter((setup) => !filters.setupType || setup.setupType === filters.setupType)
      .filter((setup) => !filters.direction || (setup.direction ?? 'N/A') === filters.direction)
      .filter((setup) => !filters.score || (setup.score ?? 'N/A') === filters.score)
      .map((setup) => ({
        ...setup,
        stockName: stocksBySymbol[setup.symbol]?.name ?? null,
        sector: stocksBySymbol[setup.symbol]?.sector ?? null
      }));
  });

  protected readonly typeOptions = computed<SubsectionOption[]>(() => this.buildOptions('setupType'));
  protected readonly directionOptions = computed<SubsectionOption[]>(() => this.buildOptions('direction'));
  protected readonly scoreOptions = computed<SubsectionOption[]>(() => this.buildOptions('score'));

  constructor() {
    this.load();
  }

  protected onSelectedSymbolChange(symbol: string | null): void {
    this.selectedSymbol.set(symbol);
  }

  protected onFiltersChange(filters: PanelFilters): void {
    this.filters.set(filters);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      health: this.healthApi.check(),
      stocks: this.stocksApi.list(),
      setups: this.setupsApi.list()
    }).subscribe({
      next: ({ health, stocks, setups }) => {
        if (health.status !== 'ok') {
          this.error.set('Backend health check failed.');
          this.loading.set(false);
          return;
        }
        this.stocks.set(stocks.items ?? []);
        this.setups.set(setups.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load backend data. Ensure backend runs on localhost:8080.');
        this.loading.set(false);
      }
    });
  }

  private buildOptions(kind: 'setupType' | 'direction' | 'score'): SubsectionOption[] {
    const counts = new Map<string, number>();
    for (const setup of this.setups()) {
      const valueRaw = kind === 'setupType' ? setup.setupType : setup[kind];
      const value = valueRaw ?? 'N/A';
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: value }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
}
