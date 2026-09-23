import React from 'react';

/** Kulatý avatar, bez fotky první písmeno přezdívky. Jeden pro feed i vlákno. */
export const Avatar: React.FC<{ url: string | null; jmeno: string; velikost?: 'mala' | 'stredni' }> = ({
  url,
  jmeno,
  velikost = 'stredni',
}) => {
  const rozmer = velikost === 'mala' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  if (url) {
    return <img src={url} alt="" className={`${rozmer} rounded-full object-cover border border-slate-700 shrink-0`} />;
  }
  return (
    <span className={`${rozmer} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 shrink-0`}>
      {jmeno.slice(0, 1).toUpperCase()}
    </span>
  );
};
