import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export type ConfirmDialogData = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title || 'Confirm action' }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">{{ data.cancelText || 'Cancel' }}</button>
      <button mat-flat-button color="primary" (click)="dialogRef.close(true)">{{ data.confirmText || 'Confirm' }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
    public dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>
  ) {}
}

export type MessageDialogData = {
  title?: string;
  message: string;
  closeText?: string;
};

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title || 'Notice' }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" (click)="dialogRef.close()">{{ data.closeText || 'OK' }}</button>
    </mat-dialog-actions>
  `,
})
export class MessageDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: MessageDialogData,
    public dialogRef: MatDialogRef<MessageDialogComponent, void>
  ) {}
}

export type PromptDialogData = {
  title?: string;
  label?: string;
  value?: string;
  confirmText?: string;
  cancelText?: string;
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.title || 'Enter name' }}</h2>
    <mat-dialog-content>
      <mat-form-field class="prompt-dialog__field" appearance="outline">
        <mat-label>{{ data.label || 'Name' }}</mat-label>
        <input
          matInput
          [(ngModel)]="value"
          (keydown.enter)="$event.preventDefault(); submit()"
          autocomplete="off"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">
        {{ data.cancelText || 'Cancel' }}
      </button>
      <button mat-flat-button color="primary" type="button" [disabled]="!trimmed" (click)="submit()">
        {{ data.confirmText || 'OK' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PromptDialogComponent {
  value = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: PromptDialogData,
    public dialogRef: MatDialogRef<PromptDialogComponent, string | undefined>
  ) {
    this.value = data.value ?? '';
  }

  get trimmed(): string {
    return (this.value || '').trim();
  }

  submit(): void {
    if (!this.trimmed) {
      return;
    }
    this.dialogRef.close(this.trimmed);
  }
}
