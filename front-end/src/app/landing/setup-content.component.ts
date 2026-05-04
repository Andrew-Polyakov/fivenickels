import { Component, Input } from '@angular/core';
import { SetupResponse, StockResponse } from '../api/api-types';

export interface SetupViewModel extends SetupResponse {
  stockName: string | null;
  sector: string | null;
}

@Component({
  selector: 'app-setup-content',
  standalone: true,
  templateUrl: './setup-content.component.html',
  styleUrl: './setup-content.component.scss'
})
export class SetupContentComponent {
  @Input({ required: true }) setups: SetupViewModel[] = [];
  @Input({ required: true }) stocksBySymbol: Record<string, StockResponse> = {};

  protected trackById(_: number, setup: SetupViewModel): number {
    return setup.id;
  }
}
