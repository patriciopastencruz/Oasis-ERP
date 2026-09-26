import { redirect } from "next/navigation";

// Llegadas y salidas ahora se ven juntas en /lodging/arrivals.
export default function Page() {
  redirect("/lodging/arrivals");
}
