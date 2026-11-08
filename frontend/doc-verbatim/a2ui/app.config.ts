provideCopilotKit({
  runtimeUrl: "/api/copilotkit",
  a2ui: {
    catalog: productCatalog,
    recovery: { showAfterMs: 2_000, showAfterAttempts: 2 },
  },
});
