import { MdListItem } from "@material/web/list/list-item";
import { css } from "lit";
import { customElement } from "lit/decorators";

@customElement("ha-md-list-item")
export class HaMdListItem extends MdListItem {
  static override styles = [
    ...super.styles,
    css`
      :host {
        --ha-icon-display: block;
        --md-sys-color-primary: var(--primary-text-color);
        --md-sys-color-secondary: var(--secondary-text-color);
        --md-sys-color-surface: var(--card-background-color);
        --md-sys-color-on-surface: var(--primary-text-color);
        --md-sys-color-on-surface-variant: var(--secondary-text-color);
      }
      md-item {
        overflow: var(--md-item-overflow, hidden);
        align-items: var(--md-item-align-items, center);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-md-list-item": HaMdListItem;
  }
}
