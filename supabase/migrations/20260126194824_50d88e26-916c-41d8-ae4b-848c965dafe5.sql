-- Add preferred_player column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN preferred_player text NOT NULL DEFAULT 'shaka';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.preferred_player IS 'User preferred video player engine: shaka, clappr, or native';