import Sidebar from "@/components/sidebar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 md:pb-6 print:p-0">
        {children}
      </main>
    </div>
  );
}
