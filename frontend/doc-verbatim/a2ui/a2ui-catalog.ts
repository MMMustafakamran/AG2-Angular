const catalog = createAngularCatalog(
  {
    Badge: { props: z.object({ label: z.string() }) },
    Panel: { props: z.object({ children: ChildListSchema }) },
  },
  {
    Badge: { tagName: "acme-badge", element: AcmeBadge },
    Panel: PanelComponent,
  },
  { includeBasicCatalog: true },
);
