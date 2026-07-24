export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#ecf0f4] p-5">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
