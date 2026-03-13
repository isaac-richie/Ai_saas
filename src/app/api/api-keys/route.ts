import { createClient } from '@/infrastructure/supabase/server';
import { NextResponse } from 'next/server';
import { encryptApiKey } from '@/lib/encryption';

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider_id, api_key, nickname } = await request.json();

    // Encrypt the key before storing
    const encrypted = encryptApiKey(api_key);

    const { data, error } = await supabase
        .from('user_api_keys')
        .insert({
            user_id: user.id,
            provider_id,
            encrypted_key: encrypted,
            key_nickname: nickname || null,
            last_test_status: 'untested'
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
}

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
        .from('user_api_keys')
        .select(`
      id,
      provider_id,
      key_nickname,
      is_active,
      last_test_status,
      last_tested_at,
      last_used_at,
      providers(name, type, logo_url)
    `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
}
