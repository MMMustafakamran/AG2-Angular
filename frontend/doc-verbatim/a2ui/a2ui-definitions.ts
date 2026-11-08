// features/a2ui/a2ui-definitions.ts
export const fixedDefinitions = {
  Card: { props: z.object({ child: z.string() }) },
  Title: { props: z.object({ text: dynamicString }) },
  Airport: { props: z.object({ code: dynamicString }) },
  Arrow: { props: z.object({}) },
  AirlineBadge: { props: z.object({ name: dynamicString }) },
  PriceTag: { props: z.object({ amount: dynamicString }) },
  Button: {
    props: z.object({
      child: z.string(),
      variant: z.enum(["primary", "secondary", "ghost"]).optional(),
      action: z.unknown().optional(),
    }),
  },
} satisfies A2UICatalogDefinitions;
