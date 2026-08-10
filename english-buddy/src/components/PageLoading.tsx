/** Instant route-level loading screen: the page swaps immediately on tap. */
export function PageLoading() {
  return (
    <main className="shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
      <div className="pageSpin" role="status" aria-label="Caricamento…" />
    </main>
  );
}
