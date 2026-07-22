"use client";

import Image from "next/image";
import Link from "next/link";
import { useIsAdminGeneral } from "@/components/layout/admin-mode";

export const GENERIC_LOGO = "/oasis-logo-crane.png";
export const GENERIC_NAME = "Oasis Company";

export function SidebarBrand({
  homeHref,
  unitName,
  unitLogo,
}: {
  homeHref: string;
  unitName?: string;
  unitLogo: string;
}) {
  const inAdminGeneral = useIsAdminGeneral();
  const name = inAdminGeneral ? GENERIC_NAME : (unitName ?? "OASIS ERP");
  const logo = inAdminGeneral ? GENERIC_LOGO : unitLogo;

  return (
    <Link href={homeHref} className="mx-auto block w-fit">
      <span className="grid size-36 place-items-center">
        <Image
          src={logo}
          alt={`Logo de ${name}`}
          width={144}
          height={144}
          priority
          className="size-32 rounded-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.18)]"
        />
      </span>
      <span className="mt-1 block text-center">
        <b className="block text-sm tracking-[.08em]">{name}</b>
        <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[.16em] text-white/60">
          ERP OASIS
        </span>
      </span>
    </Link>
  );
}
