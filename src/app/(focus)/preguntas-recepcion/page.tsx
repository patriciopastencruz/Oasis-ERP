import type { Metadata } from "next";
import { StaffQuestionsView } from "@/modules/lucia/staff-questions-view";

export const metadata: Metadata = { title: "Preguntas a recepción · Oasis" };

export default function StandaloneStaffQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <StaffQuestionsView searchParams={searchParams} basePath="/preguntas-recepcion" standalone />;
}
