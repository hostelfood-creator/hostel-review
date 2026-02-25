<<<<<<< HEAD
-- Run this SQL in your Supabase SQL Editor to support the Forgot Password Flow

CREATE TABLE IF NOT EXISTS public.password_resets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    register_id TEXT NOT NULL,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- An academic/register ID shouldn't have more than 1 active OTP at a time
    UNIQUE(register_id)
);

-- RLS Security: We only let the Service Role Key manipulate this table.
-- Anon and Authenticated users CANNOT read or write directly to this table from the frontend.
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- If a user requests another OTP, we want to UPSERT or we simply delete expired ones
-- Let's create a function to clean up expired OTPs automatically
CREATE OR REPLACE FUNCTION clean_expired_otps() RETURNS void AS $$
BEGIN
  DELETE FROM public.password_resets WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
=======
-- Run this SQL in your Supabase SQL Editor to support the Forgot Password Flow

CREATE TABLE IF NOT EXISTS public.password_resets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    register_id TEXT NOT NULL,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- An academic/register ID shouldn't have more than 1 active OTP at a time
    UNIQUE(register_id)
);

-- RLS Security: We only let the Service Role Key manipulate this table.
-- Anon and Authenticated users CANNOT read or write directly to this table from the frontend.
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- If a user requests another OTP, we want to UPSERT or we simply delete expired ones
-- Let's create a function to clean up expired OTPs automatically
CREATE OR REPLACE FUNCTION clean_expired_otps() RETURNS void AS $$
BEGIN
  DELETE FROM public.password_resets WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
