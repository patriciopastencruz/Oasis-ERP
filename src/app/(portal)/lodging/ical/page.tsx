import { redirect } from "next/navigation";

// La conexión con Booking y Airbnb por iCal se desactivó: el calendario se maneja a mano en el ERP.
export default function Page() {
  redirect("/lodging");
}
