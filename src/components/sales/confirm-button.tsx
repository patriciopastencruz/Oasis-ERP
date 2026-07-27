"use client";

/** Botón de envío que pide confirmación antes de dejar avanzar el submit del form padre. */
export function ConfirmButton({
  className,
  message,
  children,
}: {
  className?: string;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
