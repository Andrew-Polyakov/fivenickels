import { Component, EventEmitter, Input, Output } from '@angular/core';
import { StockResponse } from '../api/api-types';

@Component({
  selector: 'app-ticker-carousel',
  standalone: true,
  templateUrl: './ticker-carousel.component.html',
  styleUrl: './ticker-carousel.component.scss'
})
export class TickerCarouselComponent {
  @Input({ required: true }) stocks: StockResponse[] = [];
  @Input() selectedSymbol: string | null = null;
  @Output() selectedSymbolChange = new EventEmitter<string | null>();

  protected trackBySymbol(_: number, stock: StockResponse): string {
    return stock.symbol;
  }

  protected select(symbol: string): void {
    this.selectedSymbolChange.emit(this.selectedSymbol === symbol ? null : symbol);
  }
}
