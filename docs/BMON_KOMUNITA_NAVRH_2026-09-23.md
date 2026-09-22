# BMON – Komunita: návrh (2026-09-23)

## Rozhodnutí
- Rozšířit stávající fórum (community_categories / community_posts / community_replies + api/community/*), ne stavět nový feed.
- Komunita pro všechny 3 tarify.
- author_name = přezdívka z „Jak ti máme říkat“ (migrace 20260921090000), fallback jméno z profilu.

## Ověřený stav (SQL 23. 9. 2026)
- `community_categories`: 4 řádky (Trénink `trenink`, Jídlo a strava `jidlo-strava`, Motivace a progres `motivace-progres`, Obecné `obecne`). `community_posts` 0, `community_replies` 0. RLS zapnuté.
- Backend: `api/community/index.js` (GET seznam / POST téma), `categories.js`, `reply.js`, `topic/`. Bearer token + `supabaseServer`.
- Frontend: žádná komponenta ani route na komunitu.
- Buckets `avatars`, `recipe-images`, `exercise-media` jsou public – pro fotky postavy nepoužitelné.
- `body_measurements`: zdroj pro automatické doplnění váhy do check-inu.

## Sekce (kategorie)
| slug | název | typ obsahu |
|---|---|---|
| `muj-progres` (nová, sort_order 0) | Můj progres | check-in: fotky + váha + poznámka |
| `trenink` | Trénink | text (+ fotky volitelně) |
| `jidlo-strava` | Jídlo a strava | text + fotka jídla |
| `motivace-progres` → přejmenovat slug na `motivace`, název „Motivace“ | Motivace | text |
| `obecne` | Obecné | text |

## Datový model (1 migrace)
```sql
alter table public.community_posts
  add column post_type text not null default 'text' check (post_type in ('text','checkin')),
  add column weight_kg numeric(5,1),
  add column is_hidden boolean not null default false,
  add column reply_count int not null default 0,
  add column like_count int not null default 0;

create table public.community_post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,          -- {user_id}/{post_id}/{uuid}.jpg v bucketu community-photos
  width int, height int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.community_post_photos(post_id);

create table public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- bucket PRIVATE, čtení jen přes signed URL z API (service role)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-photos','community-photos', false, 5242880, array['image/jpeg','image/png','image/webp']);
```
- Triggery: `reply_count` (insert/delete na community_replies), `like_count` (insert/delete na community_likes).
- Seed: insert kategorie `muj-progres` (sort_order 0), update `motivace-progres` → slug `motivace`, name `Motivace`.

### RLS (povinné na všech nových tabulkách)
- `community_post_photos`: SELECT authenticated; INSERT/DELETE jen `auth.uid() = user_id`.
- `community_likes`: SELECT authenticated; INSERT/DELETE jen `auth.uid() = user_id`.
- `community_reports`: INSERT authenticated (`auth.uid() = reporter_id`); SELECT nikdo (jen service role).
- `community_posts`: příspěvky s `is_hidden = true` vidí jen autor (v API filtrovat `is_hidden = false OR user_id = me`).
- Storage `community-photos`: žádná public policy – upload i čtení jde výhradně přes API se service klíčem.

## API (rozšíření `api/community/`)
- `POST /api/community` – navíc `post_type` ('text'|'checkin'), `weight_kg`, `photos[]` (base64 data URL, max 4). Server: validace MIME, `sharp` resize na max 1600 px delší strana, výstup JPEG q80, strip EXIF (sharp bez `.withMetadata()`), upload do `community-photos/{user_id}/{post_id}/{uuid}.jpg`, insert do `community_post_photos`. U check-inu bez `weight_kg` doplnit poslední hodnotu z `body_measurements` daného uživatele. `is_hidden` volitelně z klienta („Jen pro mě“). Limit 10 příspěvků/den/uživatel (count v `community_posts` za posledních 24 h → 429).
- `GET /api/community` a `GET /api/community/topic/[id]` – ke každému příspěvku `photos[]` jako signed URL (`createSignedUrl`, 3600 s), `like_count`, `liked_by_me`, `post_type`, `weight_kg`. Filtr `is_hidden`.
- `POST /api/community/like` – body `{ post_id }`, toggle, vrací `{ liked, like_count }`.
- `DELETE /api/community/post/[id]` – jen vlastník (PR 2: i admin); smaže soubory ze storage + řádek (cascade).
- PR 2: `POST /api/community/report`, `api/admin/community-reports.js` (seznam + přepínač `is_hidden`).

## Frontend (Vite/React, `src/routing.ts`, `src/App.tsx`)
- Nová záložka **Komunita** v hlavní navigaci.
- `CommunityPage`: chipy kategorií nahoře (výchozí „Vše“), seznam karet: avatar, přezdívka, čas, kategorie, náhled textu, 1. fotka, počet ❤️ a 💬. Tlačítko „+ Nový příspěvek“.
- `CommunityPostDetail`: galerie fotek (tap = fullscreen), text, váha u check-inu, odpovědi + formulář odpovědi, u vlastního příspěvku „Smazat“.
- `NewPostSheet`: kategorie, přepínač „Běžný příspěvek / Check-in“, text, až 4 fotky (klientský resize na 1600 px canvasem před odesláním), u check-inu předvyplněná poslední váha, přepínač „Sdílet s komunitou / Jen pro mě“ (→ `is_hidden`).
- Prázdný stav v „Můj progres“: „Přidej první check-in – fotka + váha. Za měsíc uvidíš rozdíl.“
- Styl a komponenty převzít z existujících stránek (Dnes/Profil), česky, mobile-first, texty dle `docs/copy-rules.md`.

## Pravidla a bezpečnost
- Fotky postavy = citlivá data: private bucket, signed URL, EXIF pryč. `delete-account.js` musí smazat i `community-photos/{user_id}/` (PR 2).
- Souhlas s pravidly komunity při prvním příspěvku s fotkou → `souhlasy_uzivatelu` typ `community_rules` (PR 2).
- Limity: 4 fotky / příspěvek, 5 MB / soubor, 10 příspěvků / den.
- Free plán Supabase: 1 GB storage ≈ 4 000 fotek po resize. Sledovat.

## Fáze
1. **PR 1 (MVP):** migrace + záložka Komunita + seznam/detail/odpovědi + nový příspěvek s fotkami + check-in + like + smazání vlastního příspěvku.
2. **PR 2:** report + admin moderace + pravidla komunity + souhlas + mazání fotek při smazání účtu. Teprve potom pustit ven.
3. Později: notifikace na odpověď, TED komentuje check-in, týdenní výzvy.
