/** Tvary, které vrací `api/community/*`. Jedno místo pro všechny tři obrazovky. */

export interface KomunitaKategorie {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order: number;
  topic_count?: number;
}

export interface KomunitaFotka {
  id: string;
  /** Podepsaná URL z private bucketu, platnost 1 h. */
  url: string;
  width: number | null;
  height: number | null;
}

export interface KomunitaOdpoved {
  id: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  created_at: string;
  user_id?: string;
}

export interface KomunitaPrispevek {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  title: string;
  content: string;
  category_id: string | null;
  post_type: 'text' | 'checkin';
  weight_kg: number | null;
  is_hidden: boolean;
  reply_count: number;
  like_count: number;
  liked_by_me: boolean;
  can_delete: boolean;
  photos: KomunitaFotka[];
  created_at: string;
  last_replies?: KomunitaOdpoved[];
}

/** Kolik fotek unese jeden příspěvek — zrcadlí limit v `lib/community.js`. */
export const MAX_FOTEK = 4;

/** Nejdelší strana po zmenšení v prohlížeči. Server ji pak hlídá znovu. */
export const MAX_HRANA_PX = 1600;
