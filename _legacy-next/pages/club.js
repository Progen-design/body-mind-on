import { useEffect } from "react";
import { useRouter } from "next/router";

// Přesměrování na novou samostatnou stránku ON Club
export default function ClubPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/on-club");
  }, [router]);
  return null;
}
