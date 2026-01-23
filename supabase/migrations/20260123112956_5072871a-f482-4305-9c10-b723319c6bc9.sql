-- Add preferred_device column to profiles table for TV mode support
ALTER TABLE public.profiles 
ADD COLUMN preferred_device text DEFAULT 'desktop' 
CHECK (preferred_device IN ('desktop', 'mobile', 'tv'));