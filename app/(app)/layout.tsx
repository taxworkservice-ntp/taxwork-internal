import Sidebar from "@/components/sidebar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 pb-16 pt-16 sm:p-6 md:pt-6">
        {children}
      </main>
    </div>
  );
}
