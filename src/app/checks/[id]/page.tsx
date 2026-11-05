import { Suspense } from "react";
import Report from "./report";

async function ReportForParams({ params }: { params: PageProps<"/checks/[id]">["params"] }) {
  const { id } = await params;
  return <Report id={id} />;
}

export default function CheckPage({ params }: PageProps<"/checks/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading report…</p>}>
      <ReportForParams params={params} />
    </Suspense>
  );
}
