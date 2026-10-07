"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mientras la IA termina de leer comprobantes, recarga el informe cada pocos
// segundos para que el resultado aparezca sin que el usuario tenga que hacerlo.
export function ReceiptReviewRefresh({ attempts = 8 }: { attempts?: number }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= attempts) clearInterval(timer);
    }, 12_000);
    return () => clearInterval(timer);
  }, [router, attempts]);
  return null;
}
