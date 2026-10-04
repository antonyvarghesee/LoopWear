-- Migration to add location column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;
