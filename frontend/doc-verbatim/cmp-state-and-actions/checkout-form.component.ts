// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/state-and-actions (Angular tab), "Keep what the user types". Verbatim.
import { Component, model } from "@angular/core";

@Component({
  selector: "app-checkout-form",
  template: `<input [value]="email() ?? ''" (input)="email.set($any($event.target).value)" />`,
})
export class CheckoutForm {
  readonly email = model<string>();
}
