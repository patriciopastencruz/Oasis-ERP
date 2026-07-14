export function Flash({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  const value = error ?? success;
  if (!value) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {value}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-[#d6e0da] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#277a55]";
export const buttonClass =
  "rounded-xl bg-[#176b46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#12583a] disabled:opacity-50";
