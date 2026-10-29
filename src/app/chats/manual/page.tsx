import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MANUAL_IMAGES_NOTE, MANUAL_SECTIONS, MANUAL_TITLE, MANUAL_UPDATED, type ManualBlock } from "@/modules/lucia/manual";

export const metadata = { title: "Manual de Lucía" };

/** Texto con **negritas** (el manual no usa otro formato). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part,
      )}
    </>
  );
}

function Block({ block }: { block: ManualBlock }) {
  switch (block.kind) {
    case "p":
      return <p><Rich text={block.text} /></p>;
    case "steps":
      return (
        <ol className="list-decimal space-y-1.5 pl-5">
          {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
        </ol>
      );
    case "bullets":
      return (
        <ul className="list-disc space-y-1.5 pl-5">
          {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#f0f2f5] text-xs text-slate-600">
              <tr>{block.head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t align-top">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 ${j === 0 ? "font-semibold" : ""}`}><Rich text={cell} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "tip":
      return <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">💡 <Rich text={block.text} /></p>;
    case "warning":
      return <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">⚠️ <Rich text={block.text} /></p>;
    case "image":
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen estática del manual, también para el PDF */}
          <img src={block.src} alt={block.alt} loading="lazy" className="mx-auto w-full max-w-[340px] rounded-xl" />
          {block.notes && (
            <ol className="space-y-1.5">
              {block.notes.map((note, i) => (
                <li key={i} className="flex gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white">{i + 1}</span>
                  <span><Rich text={note} /></span>
                </li>
              ))}
            </ol>
          )}
        </figure>
      );
  }
}

/** Manual de uso para recepción, dentro de la app Oasis Chats. */
export default function ChatsManualPage() {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[#075e54] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] text-white">
        <Link href="/chats" aria-label="Volver a los chats" className="grid size-9 place-items-center rounded-full bg-white/10">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{MANUAL_TITLE}</h1>
          <p className="text-xs text-emerald-100">Actualizado el {MANUAL_UPDATED}</p>
        </div>
      </header>

      <main className="flex-1 space-y-3 px-3 py-3">
        <nav className="rounded-2xl bg-white p-3 text-sm shadow-sm" aria-label="Contenido">
          <p className="mb-1 font-semibold">Contenido</p>
          <p className="mb-2 text-xs text-slate-500">{MANUAL_IMAGES_NOTE}</p>
          <ol className="grid gap-1">
            {MANUAL_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-[#075e54] underline-offset-2 hover:underline">{s.emoji} {s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {MANUAL_SECTIONS.map((s) => (
          <details key={s.id} id={s.id} open className="scroll-mt-20 rounded-2xl bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-3 text-base font-bold">{s.emoji} {s.title}</summary>
            <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-slate-800">
              {s.blocks.map((b, i) => <Block key={i} block={b} />)}
            </div>
          </details>
        ))}

        <p className="pb-[max(16px,env(safe-area-inset-bottom))] text-center text-xs text-slate-500">
          ¿Dudas que no están aquí? Pregúntenle a administración.
        </p>
      </main>
    </>
  );
}
