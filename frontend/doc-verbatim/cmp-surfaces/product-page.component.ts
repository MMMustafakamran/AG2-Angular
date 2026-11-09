// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/surfaces (Angular tab), "One target for each item". Verbatim.
@Component({
  selector: "app-product-page",
  imports: [CopilotGenerativeUISurface],
  template: `
    <copilot-generative-ui-surface
      [id]="'recommendations-' + product().id"
      [description]="recommendationsDescription(product())"
    />
  `,
})
export class ProductPage {
  readonly product = input.required<Product>();

  protected recommendationsDescription({ name }: Product) {
    return `The "You might also like" row under ${name}. Show related products here. Never include ${name} itself.`;
  }
}
