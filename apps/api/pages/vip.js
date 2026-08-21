import { useEffect } from "react";
import { useRouter } from "next/router";

// Přesměrování na novou samostatnou stránku Chci VIP
export default function VipPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/chci-vip");
  }, [router]);
  return null;
}
