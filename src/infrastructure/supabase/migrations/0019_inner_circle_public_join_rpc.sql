create or replace function public.generate_inner_circle_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text := '';
  i integer;
begin
  for i in 1..8 loop
    candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
  end loop;

  return candidate;
end;
$$;

create or replace function public.join_inner_circle_waitlist(
  p_full_name text,
  p_instagram_handle text,
  p_social_handle text,
  p_email text,
  p_referred_by_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  normalized_name text := trim(p_full_name);
  normalized_instagram text := lower(regexp_replace(trim(coalesce(p_instagram_handle, 'not-provided')), '^@+', ''));
  normalized_social text := lower(regexp_replace(trim(coalesce(p_social_handle, 'not-provided')), '^@+', ''));
  normalized_ref text := nullif(upper(trim(coalesce(p_referred_by_code, ''))), '');
  existing_row public.inner_circle_waitlist%rowtype;
  candidate text;
  inserted_id uuid;
  tries integer := 0;
begin
  if normalized_name is null or length(normalized_name) < 2 then
    raise exception 'Name is required.';
  end if;

  if normalized_email is null or normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid email is required.';
  end if;

  if normalized_instagram is null or length(normalized_instagram) < 2 then
    normalized_instagram := 'not-provided';
  end if;

  if normalized_social is null or length(normalized_social) < 2 then
    normalized_social := 'not-provided';
  end if;

  select *
  into existing_row
  from public.inner_circle_waitlist
  where email = normalized_email
  limit 1;

  if found then
    update public.inner_circle_waitlist
    set
      full_name = normalized_name,
      instagram_handle = normalized_instagram,
      social_handle = normalized_social
    where id = existing_row.id
    returning * into existing_row;

    return jsonb_build_object('ok', true, 'referralCode', existing_row.referral_code);
  end if;

  loop
    tries := tries + 1;
    candidate := public.generate_inner_circle_referral_code();

    begin
      insert into public.inner_circle_waitlist (
        full_name,
        instagram_handle,
        social_handle,
        email,
        referral_code,
        referred_by_code
      )
      values (
        normalized_name,
        normalized_instagram,
        normalized_social,
        normalized_email,
        candidate,
        normalized_ref
      )
      returning id into inserted_id;

      exit;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;

  if normalized_ref is not null then
    update public.inner_circle_waitlist
    set referral_count = referral_count + 1
    where referral_code = normalized_ref;
  end if;

  return jsonb_build_object('ok', true, 'referralCode', candidate);
end;
$$;

grant execute on function public.generate_inner_circle_referral_code() to anon, authenticated, service_role;
grant execute on function public.join_inner_circle_waitlist(text, text, text, text, text) to anon, authenticated, service_role;
