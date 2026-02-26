/*
  # Add Revolut Pro Payment Fields

  1. New Columns in `profiles` table
    - `revolut_account_id` (text, nullable) - Unique identifier for user's Revolut Pro account
    - `revolut_subscription_id` (text, nullable) - Reference to active Revolut subscription/payment
    - `payment_status` (text, enum) - Current payment status: active, pending, failed, canceled, expired
    - `payment_method` (text) - Payment provider identifier: currently 'revolut', for future multi-provider support
    - `last_payment_date` (timestamp) - Timestamp of most recent successful payment

  2. Security
    - Payment fields are only accessible to the user themselves via RLS
    - Admin users can view all payment data for support/debugging

  3. Notes
    - Revolut account ID is used to link user with Revolut Pro API
    - Payment status determines if user can access protected resources
    - last_payment_date helps track subscription validity period
*/

DO $$
BEGIN
  -- Add revolut_account_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'revolut_account_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN revolut_account_id text;
    ALTER TABLE profiles ADD CONSTRAINT revolut_account_id_unique UNIQUE(revolut_account_id);
  END IF;

  -- Add revolut_subscription_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'revolut_subscription_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN revolut_subscription_id text;
  END IF;

  -- Add payment_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN payment_status text DEFAULT 'pending'::text
      CHECK (payment_status = ANY (ARRAY['active'::text, 'pending'::text, 'failed'::text, 'canceled'::text, 'expired'::text]));
  END IF;

  -- Add payment_method column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE profiles ADD COLUMN payment_method text DEFAULT 'revolut'::text;
  END IF;

  -- Add last_payment_date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_payment_date'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_payment_date timestamptz;
  END IF;
END $$;

-- Create RLS policies for payment data if they don't exist
CREATE POLICY "Users can view own payment status"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all payment data"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
