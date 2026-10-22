import { StaffQuestionsView } from "@/modules/lucia/staff-questions-view";

export default function LuciaStaffQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <StaffQuestionsView searchParams={searchParams} basePath="/lodging/lucia/preguntas" />;
}
