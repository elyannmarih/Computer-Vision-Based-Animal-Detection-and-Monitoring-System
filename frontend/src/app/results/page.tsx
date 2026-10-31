import { Suspense } from "react";
import ResultsView from "./results-view";

export default function ResultsPage() {
  // The view reads ?image=<id> from the URL, so it renders on the client inside this boundary
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[1050px] px-6 py-20">
          <p role="status" className="text-sm text-[#747470]">Loading results…</p>
        </main>
      }
    >
      <ResultsView />
    </Suspense>
  );
}
