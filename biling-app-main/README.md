# Jalaram Jewellers Billing App

## What this app does
- Passcode-protected billing panel (passcode: `7538`)
- Invoice and Estimate mode toggle with mode-specific layouts
- Sequential document numbers from database (`INV-0001`, `EST-0001`)
- Editable shop settings (name, tagline, contact, rates, formula note)
- Logo upload and About QR upload with local persistence
- Dynamic UPI QR generation using final payable amount
- Save bill, print, PDF download, WhatsApp and Email share actions

## Tech stack
- Frontend: React
- Backend: FastAPI
- Database: MongoDB (local-first)

## Cloud database setup (Supabase placeholders)

The backend already supports **Supabase + Mongo fallback**.

### 1) Fill these backend `.env` values
```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_CUSTOMERS_TABLE=customers
SUPABASE_COUNTERS_TABLE=number_counters
```

### 2) Create these tables in Supabase SQL editor
```sql
create table if not exists customers (
  id text primary key,
  name text not null,
  phone text,
  address text,
  email text,
  updated_at timestamptz default now()
);

create unique index if not exists customers_phone_unique_idx on customers(phone) where phone is not null;
create unique index if not exists customers_name_unique_idx on customers(name);

create table if not exists number_counters (
  mode text primary key,
  value int not null default 0,
  updated_at timestamptz default now()
);
```

### 3) (Recommended) Add atomic counter RPC to avoid duplicates
```sql
create or replace function next_document_number(p_mode text)
returns int
language plpgsql
as $$
declare next_val int;
begin
  insert into number_counters(mode, value, updated_at)
  values (p_mode, 1, now())
  on conflict(mode) do update set value = number_counters.value + 1, updated_at = now()
  returning value into next_val;
  return next_val;
end;
$$;
```

### 4) Restart backend after updating `.env`
```bash
sudo supervisorctl restart backend
```

## Notes
- Current version is intentionally local-first (as requested).
- If Supabase credentials are not real, app continues with Mongo automatically.
- Customer recall/autosuggest works from cloud when connected, else from Mongo fallback.
