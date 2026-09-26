import Image from "next/image";
import Link from "next/link";
import React from "react";

function Navbar() {
  return (
    <div className="fixed inset-x-0 top-0 bg-slate-100  z-[10] h-fit  py-4 ">
      <div className="flex items-center justify-between h-full gap-2 px-8 mx-auto">
        <div className="flex flex-row justify-center">
          <Link href={"/dashboard"} className="flex items-center">
            <Image
              src="/logo_enest_purple.png"
              alt="E-nest"
              width={120}
              height={40}
              className="object-contain"
              priority
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
