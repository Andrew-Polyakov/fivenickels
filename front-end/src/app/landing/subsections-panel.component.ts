import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface PanelFilters {
  setupType: string | null;
  direction: string | null;
  score: string | null;
}

export interface SubsectionOption {
  label: string;
  value: string;
  count: number;
}

@Component({
  selector: 'app-subsections-panel',
  standalone: true,
  templateUrl: './subsections-panel.component.html',
  styleUrl: './subsections-panel.component.scss'
})
export class SubsectionsPanelComponent {
  @Input({ required: true }) typeOptions: SubsectionOption[] = [];
  @Input({ required: true }) directionOptions: SubsectionOption[] = [];
  @Input({ required: true }) scoreOptions: SubsectionOption[] = [];
  @Input({ required: true }) filters: PanelFilters = {
    setupType: null,
    direction: null,
    score: null
  };

  @Output() filtersChange = new EventEmitter<PanelFilters>();

  protected toggle(kind: keyof PanelFilters, value: string): void {
    this.filtersChange.emit({
      ...this.filters,
      [kind]: this.filters[kind] === value ? null : value
    });
  }

  protected reset(): void {
    this.filtersChange.emit({
      setupType: null,
      direction: null,
      score: null
    });
  }
}
