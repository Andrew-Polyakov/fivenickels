import type { MatDialogConfig } from '@angular/material/dialog';

/** Applied to the dialog surface for consistent styling with global CSS in `styles.css`. */
export const APP_MATERIAL_DIALOG_PANEL_CLASS = 'app-material-dialog';

/** Merge into `MatDialog.open(...)` options so every dialog shares the same panel class. */
export function appMaterialDialogDefaults<D = unknown>(): MatDialogConfig<D> {
  return {
    panelClass: APP_MATERIAL_DIALOG_PANEL_CLASS,
    autoFocus: true,
  };
}
