import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/modules/platform/auth/application/session";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell ctx={await requireSession()}>{children}</AppShell>;
}
