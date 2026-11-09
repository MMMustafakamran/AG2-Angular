// HARNESS: the page splits src/app/shop-ui.ts over two blocks (state, functions) that both declare
// `export const shopUI`; the components import the one with the onAddToCart event.
export { shopUI } from "./shop-ui.functions"; // HARNESS
