// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/catalogs (Angular tab), "Export the catalog for other A2UI tools". Verbatim.
import { exportA2UICatalog } from "@copilotkit/angular/generative-ui";

const catalog = exportA2UICatalog(appUI, { title: "Acme app" });
fs.writeFileSync("acme-catalog.json", JSON.stringify(catalog, null, 2));
