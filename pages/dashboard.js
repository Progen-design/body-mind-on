// /pages/dashboard.js - Přesměrování na profil
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/profil');
  }, [router]);
  return null;
}
