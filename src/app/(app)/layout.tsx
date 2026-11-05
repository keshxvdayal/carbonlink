import { Sidebar } from "@/components/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="lg:pl-60 print:pl-0">
        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-8 lg:py-10">{children}</main>
      </div>
    </>
  );
}
